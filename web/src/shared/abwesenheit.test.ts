import { describe, expect, it } from 'vitest';
import { altdatenLesen, darfVerwalten, stundenVon, tageZuZeitraeumen, urlaubskonto, type Abwesenheit, type Personal } from './abwesenheit';
import type { Konfiguration, Rechte } from './rechte';

const anna: Personal = { email: 'anna@x.at', name: 'Anna', eintritt: '2020-03-01', tage: [8, 8, 8, 8, 8, 0, 0] };
const abw = (von: string, bis: string, art: Abwesenheit['art'] = 'urlaub', status: Abwesenheit['status'] = 'genehmigt'): Abwesenheit => ({
  id: von + art, email: anna.email, art, von, bis, status,
});

describe('abwesenheit', () => {
  it('zählt nur Arbeitstage ohne Feiertage', () => {
    // Mo 2026-12-21 .. So 2026-12-27: 25./26.12. sind Feiertage (Fr/Sa) → Mo–Do = 4 Tage
    expect(stundenVon(anna, abw('2026-12-21', '2026-12-27'))).toBe(32);
  });

  it('Urlaubskonto: 5 Wochen je Arbeitsjahr, Verbrauch vom ältesten Anspruch, Verfall nach 2 Jahren', () => {
    const k = urlaubskonto(anna, [abw('2026-04-13', '2026-04-17')], '2026-06-01');
    const aktuell = k.jahre.find((j) => j.start === '2026-03-01')!;
    expect(aktuell.anspruch).toBe(200);
    // Arbeitsjahre 2023/24 (verfällt 2026-03-01), 2024/25, 2025/26, 2026/27 → gültig 3 × 200 minus 40 h Urlaub
    expect(k.rest).toBe(560);
    expect(k.jahre.find((j) => j.start === '2024-03-01')!.verbraucht).toBe(40);
  });

  it('ab 25 Dienstjahren 6 Wochen', () => {
    const k = urlaubskonto({ ...anna, vordienstjahre: 24 }, [], '2026-06-01');
    expect(k.jahre.find((j) => j.start === '2021-03-01')!.anspruch).toBe(240);
  });

  it('erstes Arbeitsjahr in den ersten 6 Monaten aliquot', () => {
    const k = urlaubskonto({ ...anna, eintritt: '2026-01-01' }, [], '2026-04-01');
    expect(k.rest).toBeCloseTo(50, 0);
  });

  it('beantragte Urlaube zählen als verplant, nicht als verbraucht', () => {
    const k = urlaubskonto(anna, [abw('2026-07-06', '2026-07-10', 'urlaub', 'beantragt')], '2026-06-01');
    expect(k.verplant).toBe(40);
  });

  it('Verwaltungsrecht für Admins und gewählte Gruppen', () => {
    const r = (x: Partial<Rechte>): Rechte => ({ email: 'a@x.at', admin: false, freigeschaltet: true, gruppen: [], kategorien: [], kalender: [], ...x });
    const k = { kalender: [], gruppen: [], benutzer: [], domains: [], abwesenheitGruppen: ['buero'] } as Konfiguration;
    expect(darfVerwalten(r({ admin: true }), k)).toBe(true);
    expect(darfVerwalten(r({ gruppen: ['buero'] }), k)).toBe(true);
    expect(darfVerwalten(r({ gruppen: ['fahrer'] }), k)).toBe(false);
  });

  it('fasst Einzeltage über das Wochenende zusammen', () => {
    expect(tageZuZeitraeumen(['2026-07-09', '2026-07-10', '2026-07-13', '2026-07-15'])).toEqual([
      { von: '2026-07-09', bis: '2026-07-13' },
      { von: '2026-07-15', bis: '2026-07-15' },
    ]);
  });

  it('liest personal_daten.json und übernimmt den alten Resturlaub als Saldo', () => {
    const alt = {
      mitarbeiter: { '1': { name: 'Berta', eintritt: '2025-01-15', anspruch: 25, sollstunden: 6, ue_start_saldo: 3.5, ue_ausbezahlt: false } },
      abwesenheiten: { '1': { '2026-05-04': 'Urlaub', '2026-05-05': 'Urlaub', '2026-05-06': 'Krank', '2026-08-03': 'Urlaub' } },
      ma_zuordnung: { '1': 'Büro' },
      eintraege: [{ m_id: '1', jahr: 2025, monat: 6, ur: 2 }],
    };
    const [b] = altdatenLesen(alt, '2026-06-01');
    expect(b.name).toBe('Berta');
    expect(b.personal.gruppe).toBe('Büro');
    expect(b.personal.tage).toEqual([6, 6, 6, 6, 6, 0, 0]);
    // (1 volles Jahr + 1) × 25 − 2 manuell − 3 Kalender = 45 Tage; + 1 künftiger Urlaubstag → 46 × 6 h
    expect(b.altRestTage).toBe(45);
    expect(b.personal.urlaubStartSaldo).toBe(276);
    expect(b.abwesenheiten).toContainEqual({ art: 'krank', von: '2026-05-06', bis: '2026-05-06', status: 'gemeldet' });
    expect(b.abwesenheiten).toContainEqual({ art: 'urlaub', von: '2026-05-04', bis: '2026-05-05', status: 'genehmigt' });
  });
});
