import { describe, expect, it } from 'vitest';
import { emailErsetzen, emailGueltig } from './emailUmzug';

describe('E-Mail-Umzug', () => {
  it('ersetzt Werte und Schlüssel, lässt Ähnliches stehen', () => {
    const daten = {
      email: 'Alt@x.at',
      personen: [{ email: 'alt@x.at', name: 'A' }, { email: 'b@x.at' }],
      monate: { 'alt@x.at': { '2026-10': 3 } },
      notiz: 'Mail an alt@x.at',
    };
    const { wert, geaendert } = emailErsetzen(daten, 'alt@x.at', 'neu@x.at');
    expect(geaendert).toBe(true);
    expect(wert).toEqual({
      email: 'neu@x.at',
      personen: [{ email: 'neu@x.at', name: 'A' }, { email: 'b@x.at' }],
      monate: { 'neu@x.at': { '2026-10': 3 } },
      notiz: 'Mail an alt@x.at',
    });
    expect(emailErsetzen({ a: 1, b: ['x@y.at'] }, 'alt@x.at', 'neu@x.at').geaendert).toBe(false);
    expect(emailGueltig('neu@x.at')).toBe(true);
    expect(emailGueltig('neu@x')).toBe(false);
  });
});
