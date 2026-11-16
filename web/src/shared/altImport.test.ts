import { describe, expect, it } from 'vitest';
import { berichtLesen, excelDatum, nameZuordnen, tageZuAbwesenheiten } from './altImport';

describe('altImport', () => {
  it('Excel-Datum', () => expect(excelDatum(45658)).toBe('2025-01-01'));
  it('fasst Tage über das Wochenende zusammen, halbe Tage einzeln', () => {
    const r = tageZuAbwesenheiten(
      [
        { datum: '2025-03-06', code: 'U' },
        { datum: '2025-03-07', code: 'U' },
        { datum: '2025-03-10', code: 'U' },
        { datum: '2025-03-12', code: 'KH' },
        { datum: '2025-03-13', code: 'B' },
        { datum: '2025-03-14', code: 'k' },
      ],
      { tage: [8, 8, 8, 8, 8, 0, 0] },
    );
    expect(r.map((x) => [x.art, x.von, x.bis, x.stunden])).toEqual([
      ['urlaub', '2025-03-06', '2025-03-10', undefined],
      ['krank', '2025-03-12', '2025-03-12', 4],
      ['krank', '2025-03-14', '2025-03-14', undefined],
    ]);
  });
  it('liest Monatsberichte alt und neu', () => {
    const a = berichtLesen(['Monatsbericht 04/2026', 'Gruppe: Außenteam', 'Name Mon. Ü-Std Kr. Ur. So.', 'Dominik Riegler 04 7.0 0 5 0', 'Kevin Sauerzapf  04  6.75  4  0  0']);
    expect(a.monat).toBe('2026-04');
    expect(a.zeilen[1]).toEqual({ name: 'Kevin Sauerzapf', gruppe: 'Außenteam', ue: 6.75, ueAusb: 0, kr: 4, ur: 0, so: 0 });
    const n = berichtLesen(['Monatsbericht 05/2026', 'Anna Bauer 05 3,5 2 1 4,5 1 2 0']);
    expect(n.zeilen[0]).toMatchObject({ ue: 2, ueAusb: 1, kr: 1, ur: 2, so: 0 });
  });
  it('ordnet Namen auch vertauscht zu', () => expect(nameZuordnen('Fuchsjäger Jürgen', [{ email: 'j@x.at', name: 'Jürgen Fuchsjäger' }])).toBe('j@x.at'));
});
