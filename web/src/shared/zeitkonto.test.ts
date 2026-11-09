import { describe, expect, it } from 'vitest';
import type { Abwesenheit, Personal } from './abwesenheit';
import { altEintraegeLesen, berichtCsv, berichtHinweis, kalenderTage, monatPlus, monatsbericht, uebertrag, zeitkontoPruefen, type ZeitkontoDaten } from './zeitkonto';

const p = (email: string, name: string, gruppe?: string, x: Partial<Personal> = {}): Personal => ({ email, name, gruppe, eintritt: '2024-01-01', tage: [8, 8, 8, 8, 8, 0, 0], ...x });
const abw = (email: string, art: Abwesenheit['art'], von: string, bis: string, x: Partial<Abwesenheit> = {}): Abwesenheit => ({ id: von + art, email, art, von, bis, status: art === 'krank' ? 'gemeldet' : 'genehmigt', ...x });

describe('zeitkonto', () => {
  it('monatPlus über Jahresgrenzen', () => {
    expect(monatPlus('2026-12', 1)).toBe('2027-01');
    expect(monatPlus('2026-01', -1)).toBe('2025-12');
  });

  it('zählt Fehltage nur an Arbeitstagen, ohne Feiertage, abgelehnte nicht', () => {
    const a = p('a@x.at', 'A');
    const l = [
      abw('a@x.at', 'urlaub', '2026-10-23', '2026-10-27'), // Fr, Sa, So, Mo, Di(26. Nationalfeiertag) -> Fr + Di 27. = 3? 23 Fr, 26 Mo Feiertag, 27 Di
      abw('a@x.at', 'krank', '2026-10-05', '2026-10-06'),
      abw('a@x.at', 'pflege', '2026-10-12', '2026-10-12'),
      abw('a@x.at', 'za', '2026-10-13', '2026-10-13', { stunden: 4 }),
      abw('a@x.at', 'urlaub', '2026-10-01', '2026-10-02', { status: 'abgelehnt' }),
      abw('b@x.at', 'krank', '2026-10-01', '2026-10-30'),
      abw('a@x.at', 'krank', '2026-09-29', '2026-10-01'),
    ];
    expect(kalenderTage(a, l, '2026-10')).toEqual({ kr: 3, ur: 2, so: 1, za: 0.5 });
  });

  it('Übertrag = Start-Saldo + frühere (neu − ausbezahlt) ab „Überstunden ab“', () => {
    const a = p('a@x.at', 'A', undefined, { ueStartSaldo: 10, ueAbMonat: '2026-03' });
    const e = [
      { email: 'a@x.at', monat: '2026-02', ue: 50, ueAusb: 0, kr: 0, ur: 0, so: 0 },
      { email: 'a@x.at', monat: '2026-03', ue: 5, ueAusb: 2, kr: 0, ur: 0, so: 0 },
      { email: 'a@x.at', monat: '2026-04', ue: 1.25, ueAusb: 0, kr: 0, ur: 0, so: 0 },
      { email: 'a@x.at', monat: '2026-05', ue: 9, ueAusb: 9, kr: 0, ur: 0, so: 0 },
    ];
    expect(uebertrag(a, e, '2026-05')).toBe(14.25);
  });

  it('Monatsbericht wie Vorlage: Gruppen, Fehltage aus Folgemonat, Saldo, nur abgeschlossene', () => {
    const personal = [p('m@x.at', 'Marie', 'Büro'), p('k@x.at', 'Kevin', 'Außenteam'), p('s@x.at', 'Sam'), p('o@x.at', 'Offen', 'Büro')];
    const d: ZeitkontoDaten = {
      einstellungen: { verschiebungUe: 0, verschiebungAbw: 1 },
      eintraege: [
        { email: 'm@x.at', monat: '2026-09', ue: 12.25, ueAusb: 15, kr: 0, ur: 0, so: 0 },
        { email: 'k@x.at', monat: '2026-09', ue: 22.5, ueAusb: 22.5, kr: 1, ur: 0, so: 0 },
        { email: 's@x.at', monat: '2026-09', ue: 0, ueAusb: 0, kr: 0, ur: 0, so: 0 },
      ],
    };
    const l = [abw('k@x.at', 'krank', '2026-10-05', '2026-10-08'), abw('m@x.at', 'urlaub', '2026-09-07', '2026-09-08')];
    const b = monatsbericht(personal, l, d, '2026-09');
    expect(b.map((g) => g.gruppe)).toEqual(['Außenteam', 'Büro', 'Standard']);
    expect(b[0].zeilen[0]).toMatchObject({ name: 'Kevin', neu: 22.5, ausbezahlt: 22.5, saldo: 0, kr: 5 });
    expect(b[1].zeilen).toHaveLength(1);
    expect(b[1].zeilen[0]).toMatchObject({ saldo: -2.75, ur: 0 });
    expect(berichtHinweis('2026-09', d.einstellungen)).toContain('Überstunden sind aus Monat 09/2026 | Fehltage (Urlaub/Krank/ZA) aus Monat 10/2026');
    const csv = berichtCsv(b);
    expect(csv.startsWith('\ufeffGruppe;Name;Monat')).toBe(true);
    expect(csv).toContain('Büro;Marie;09/2026;0;12,25;15;-2,75;0;0;0');
  });

  it('prüft Daten und liest Einträge des alten Programms', () => {
    const d = zeitkontoPruefen({ eintraege: [{ email: 'A@x.at', monat: '2026-09', ue: '3' }, { email: 'a@x.at', monat: '2026-09', ue: 4 }, { email: 'x', monat: '2026-09' }, { email: 'b@x.at', monat: '2026-13' }], einstellungen: { verschiebungAbw: 5 } });
    expect(d.eintraege).toEqual([{ email: 'a@x.at', monat: '2026-09', ue: 0, ueAusb: 0, kr: 0, ur: 0, so: 0 }]);
    expect(d.einstellungen).toEqual({ verschiebungUe: 0, verschiebungAbw: 1 });
    const alt = altEintraegeLesen({ eintraege: [{ m_id: '1', jahr: '2026', monat: '9', ue: '14,5', ue_ausb: 14.5, kr: 0, ur: 1, so: 1 }, { m_id: '1', jahr: 'x', monat: '1' }] });
    expect(alt.get('1')).toEqual([{ monat: '2026-09', ue: 14.5, ueAusb: 14.5, kr: 0, ur: 1, so: 1 }]);
  });
});
