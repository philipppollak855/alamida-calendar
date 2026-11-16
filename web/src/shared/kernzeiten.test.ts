import { describe, expect, it } from 'vitest';
import { kernLuecken, kernSpannen, kernText, kernzeitenAus } from './telefonplan';

describe('Telefon-Kernzeiten', () => {
  const k = { '1': [{ von: '17:00', bis: '08:00' }], '2': [{ von: '17:00', bis: '08:00' }], ft: [{ von: '00:00', bis: '00:00' }] };
  it('Nachtzeiten reichen in den Folgetag, Feiertage ersetzen den Wochentag', () => {
    // Mo 25.5.2026 ist Pfingstmontag
    expect(kernSpannen(k, new Date(2026, 4, 25), new Date(2026, 4, 27))).toEqual([
      { von: '2026-05-25T00:00', bis: '2026-05-26T00:00' },
      { von: '2026-05-26T17:00', bis: '2026-05-27T00:00' },
    ]);
  });
  it('liefert unbesetzte Kernzeit', () => {
    const l = kernLuecken([{ von: '2026-06-01T17:00', bis: '2026-06-02T00:00' }], k, new Date(2026, 5, 1), new Date(2026, 5, 3));
    expect(l).toEqual([
      { von: '2026-06-02T00:00', bis: '2026-06-02T08:00' },
      { von: '2026-06-02T17:00', bis: '2026-06-03T00:00' },
    ]);
  });
  it('prüft Eingaben und fasst gleiche Tage im Text zusammen', () => {
    expect(kernzeitenAus({ '1': [{ von: '25:00', bis: '08:00' }] }).fehler).toMatch(/Montag/);
    expect(kernzeitenAus({ '3': [{ von: '18:00', bis: '07:00' }] }).kernzeiten).toEqual({ '3': [{ von: '18:00', bis: '07:00' }] });
    expect(kernText(k)).toBe('Mo–Di 17:00–08:00 · Feiertag 00:00–00:00');
  });
});
