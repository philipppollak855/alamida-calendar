import { describe, expect, it } from 'vitest';
import { altdatenLesen, belegDateiname, belegFehlt, belegSignaturPasst, darfVerwalten, internesKonto, istOhneEmail, stundenJeTag, umbenennungen, stundenVon, tageAnzeige, tageZuZeitraeumen, urlaubskonto, laufendBis, verlaengernFehler, wartet, type Abwesenheit, type Personal } from './abwesenheit';
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

describe('Urlaub in Tagen', () => {
  it('rechnet Stunden in Arbeitstage um, auch bei Teilzeit', () => {
    expect(stundenJeTag({ tage: [8, 8, 8, 8, 8, 0, 0] })).toBe(8);
    expect(stundenJeTag({ tage: [6, 6, 6, 2, 0, 0, 0] })).toBe(5);
    expect(tageAnzeige(200, 8)).toBe('25 Tage');
    expect(tageAnzeige(8, 8)).toBe('1 Tag');
    expect(tageAnzeige(12, 8)).toBe('1,5 Tage');
    expect(tageAnzeige(-4, 8)).toBe('-0,5 Tage');
  });
});

describe('Personal ohne E-Mail', () => {
  it('legt eine interne Kennung an und erkennt sie', () => {
    const e = internesKonto('Jörg Müller-Weiß', '7');
    expect(e).toBe('joerg-mueller-weiss-alt7@pin.invalid');
    expect(istOhneEmail(e)).toBe(true);
    expect(istOhneEmail('a@b.at')).toBe(false);
  });
  it('erkennt neu zugeordnete Konten', () => {
    const m = umbenennungen([
      { email: 'a@b.at', vorher: 'x-alt1@pin.invalid' },
      { email: 'c@d.at', vorher: 'c@d.at' },
      { email: '', vorher: 'y@pin.invalid' },
      { email: 'neu@x.at' },
    ]);
    expect([...m]).toEqual([['x-alt1@pin.invalid', 'a@b.at']]);
  });
});

describe('Verfall pro Mitarbeiter', () => {
  it('ohne Verfall bleibt jeder Jahresanspruch erhalten', () => {
    const p: Personal = { email: 'a@b.at', name: 'A', eintritt: '2015-01-01', tage: [8, 8, 8, 8, 8, 0, 0] };
    const mit = urlaubskonto(p, [], '2026-11-03');
    const ohne = urlaubskonto({ ...p, ohneVerfall: true }, [], '2026-11-03');
    expect(ohne.rest).toBe(12 * 200);
    expect(mit.rest).toBeLessThan(ohne.rest);
    expect(ohne.verfaelltBald).toBe(0);
  });
  it('Import aus dem alten Programm schaltet den Verfall aus', () => {
    const [a] = altdatenLesen({ mitarbeiter: { '1': { name: 'X', eintritt: '2020-01-01', sollstunden: 8, anspruch: 25 } } }, '2026-11-03');
    expect(a.personal.ohneVerfall).toBe(true);
  });
});

describe('Bestätigungen', () => {
  it('erkennt fehlende Bestätigungen nur bei Krank und Pflegeurlaub', () => {
    const e = { art: 'krank' as const, status: 'gemeldet' as const };
    expect(belegFehlt(e)).toBe(true);
    expect(belegFehlt({ ...e, belege: [{ id: '1', name: 'a.pdf', typ: 'application/pdf', groesse: 1, am: 0, von: 'a@b.at' }] })).toBe(false);
    expect(belegFehlt({ ...e, status: 'abgelehnt' })).toBe(false);
    expect(belegFehlt({ art: 'urlaub', status: 'genehmigt' })).toBe(false);
    expect(belegFehlt({ ...e, verdeckt: true })).toBe(false);
  });
  it('bereinigt Dateinamen und prüft den Inhalt', () => {
    expect(belegDateiname('../../Krankmeldung März.PDF', 'application/pdf')).toBe('Krankmeldung März.pdf');
    expect(belegDateiname('<script>.html', 'image/jpeg')).toBe('script.jpg');
    expect(belegDateiname('', 'image/png')).toBe('Bestaetigung.png');
    const enc = (x: string) => new TextEncoder().encode(x);
    expect(belegSignaturPasst(enc('%PDF-1.7'), 'application/pdf')).toBe(true);
    expect(belegSignaturPasst(enc('<html>'), 'application/pdf')).toBe(false);
    expect(belegSignaturPasst(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBe(true);
    expect(belegSignaturPasst(enc('RIFF0000WEBP'), 'image/webp')).toBe(true);
    expect(belegSignaturPasst(enc('%PDF-1.7'), 'text/html')).toBe(false);
  });
});

describe('Verlängern ohne neuen Antrag', () => {
  const krank: Abwesenheit = { id: 'k', email: 'a@x', art: 'krank', von: '2026-11-02', bis: '2026-11-02', status: 'gemeldet', offen: true };
  const urlaub: Abwesenheit = { id: 'u', email: 'a@x', art: 'urlaub', von: '2026-11-10', bis: '2026-11-12', status: 'genehmigt' };
  it('„bis auf Weiteres“ läuft bis heute', () => {
    expect(laufendBis(krank, '2026-11-09').bis).toBe('2026-11-09');
    expect(laufendBis({ ...krank, offen: false }, '2026-11-09').bis).toBe('2026-11-02');
    expect(laufendBis({ ...krank, status: 'abgelehnt' }, '2026-11-09').bis).toBe('2026-11-02');
  });
  it('wer darf was', () => {
    expect(verlaengernFehler(urlaub, { bis: '2026-11-14' }, false, 'a@x')).toBeNull();
    expect(verlaengernFehler(urlaub, { bis: '2026-11-11' }, false, 'a@x')).toMatch(/nach dem bisherigen/);
    expect(verlaengernFehler(urlaub, { bis: '2026-11-11' }, true, 'chef@x')).toBeNull();
    expect(verlaengernFehler(urlaub, { bis: '2026-11-14' }, false, 'b@x')).toMatch(/eigene/);
    expect(verlaengernFehler(urlaub, { bis: '2026-11-14', offen: true }, false, 'a@x')).toMatch(/Krankenstand/);
    expect(verlaengernFehler(krank, { bis: '2026-11-05' }, false, 'a@x')).toBeNull();
    expect(verlaengernFehler(krank, { bis: '2026-11-01' }, false, 'a@x')).toMatch(/Zeitraum/);
  });
  it('beantragte Verlängerung wartet', () => {
    expect(wartet(urlaub)).toBe(false);
    expect(wartet({ ...urlaub, verlaengerung: { bis: '2026-11-14', von: 'a@x', am: 1 } })).toBe(true);
  });
});

describe('Übernommener Resturlaub', () => {
  // wie nach dem Import: 11 Tage zum 4.11., Arbeitsjahr ab 1.10. steckt schon drin
  const p: Personal = { ...anna, eintritt: '2020-10-01', saldoAb: '2026-11-04', urlaubStartSaldo: 88, ohneVerfall: true };
  it('zählt das laufende Urlaubsjahr nicht doppelt und zieht Urlaub ab', () => {
    const k = urlaubskonto(p, [abw('2026-11-05', '2026-11-06'), abw('2026-11-13', '2026-11-13'), abw('2026-11-20', '2026-11-20', 'urlaub', 'beantragt')], '2026-11-09');
    expect(k.rest).toBe(72);
    expect(k.vorgeplant).toBe(8);
    expect(k.beantragt).toBe(8);
    expect(k.restGeplant).toBe(64);
  });
  it('der Stichtag selbst ist schon im übernommenen Rest abgezogen', () => {
    expect(urlaubskonto(p, [abw('2026-11-04', '2026-11-04')], '2026-11-09').rest).toBe(88);
  });
  it('neues Urlaubsjahr kommt nach dem Stichtag dazu', () => {
    expect(urlaubskonto(p, [], '2027-10-01').rest).toBe(288);
  });
});
