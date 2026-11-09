import { describe, expect, it } from 'vitest';
import { belegung, musterAus, musterSegmente, tagesAbschnitte, telEintragFehler, telefonJetzt, type TelEinsatz, type TelMuster } from './telefonplan';
import { ausText } from './bereitschaft';

const abend: TelMuster = { id: 'a', email: 'tina@x.at', name: 'Tina', tage: [1, 2, 3, 4], von: '17:00', bis: '08:00', intervall: 1, ab: '2026-11-02' };
const we: TelMuster = { id: 'b', email: 'otto@x.at', name: 'Otto', tage: [5], von: '17:00', bis: '17:00', intervall: 2, ab: '2026-11-06' };

describe('Telefonbereitschaft', () => {
  it('erzeugt Musterdienste über Mitternacht und im 2-Wochen-Rhythmus', () => {
    const s = musterSegmente(abend, ausText('2026-11-09'), ausText('2026-11-10'));
    expect(s.map((x) => `${x.von}-${x.bis}`)).toEqual(['2026-11-09T17:00-2026-11-10T08:00', '2026-11-10T17:00-2026-11-11T08:00']);
    const w = musterSegmente(we, ausText('2026-11-01'), ausText('2026-11-30')).map((x) => x.von.slice(0, 10));
    expect(w).toEqual(['2026-11-06', '2026-11-20']);
  });
  it('Einträge überschreiben das Muster', () => {
    const e: TelEinsatz[] = [{ id: 'e', email: 'max@x.at', name: 'Max', von: '2026-11-09T20:00', bis: '2026-11-09T23:00' }];
    const b = belegung(e, [abend], ausText('2026-11-09'), ausText('2026-11-10'));
    expect(b.map((x) => `${x.name} ${x.von.slice(11)}-${x.bis.slice(11)}`)).toEqual(['Tina 17:00-20:00', 'Max 20:00-23:00', 'Tina 23:00-08:00']);
    expect(telefonJetzt(e, [abend], '2026-11-09T21:30')?.name).toBe('Max');
    expect(telefonJetzt(e, [abend], '2026-11-10T07:59')?.name).toBe('Tina');
    expect(telefonJetzt(e, [abend], '2026-11-10T12:00')).toBeNull();
    expect(tagesAbschnitte(b, '2026-11-09').map((x) => `${x.von}-${x.bis}${x.s ? '' : ' frei'}`)).toEqual(['00:00-17:00 frei', '17:00-20:00', '20:00-23:00', '23:00-24:00']);
  });
  it('prüft Einträge und Muster', () => {
    const e: TelEinsatz[] = [{ id: 'e', email: 'max@x.at', name: 'Max', von: '2026-11-09T20:00', bis: '2026-11-09T23:00' }];
    expect(telEintragFehler(e, { email: 'tina@x.at', von: '2026-11-09T22:00', bis: '2026-11-10T01:00' })).toMatch(/Max/);
    expect(telEintragFehler(e, { email: 'tina@x.at', von: '2026-11-09T23:00', bis: '2026-11-10T01:00' })).toBeNull();
    expect(telEintragFehler([], { email: 'tina@x.at', von: '2026-11-09T23:00', bis: '2026-11-09T22:00' })).toMatch(/Ungültig/);
    const personen = [{ email: 'tina@x.at', rollen: ['telefon' as const] }, { email: 'otto@x.at' }];
    expect(telEintragFehler([], { email: 'otto@x.at', von: '2026-11-09T20:00', bis: '2026-11-09T21:00' }, personen)).toMatch(/Rolle/);
    expect(musterAus({ email: 'otto@x.at', tage: [1], von: '18:00', bis: '20:00', ab: '2026-11-02' }, 'n', [abend]).fehler).toMatch(/Tina/);
    expect(musterAus({ email: 'otto@x.at', tage: [1], von: '08:00', bis: '17:00', ab: '2026-11-02' }, 'n', [abend]).fehler).toBeNull();
    expect(musterAus({ email: 'otto@x.at', tage: [], von: '08:00', bis: '17:00', ab: '2026-11-02' }, 'n', []).fehler).toMatch(/Wochentag/);
    expect(musterAus({ email: 'otto@x.at', tage: [0], von: '08:00', bis: '17:00', ab: '2026-11-02', intervall: 2 }, 'n', []).muster).toMatchObject({ tage: [0], intervall: 2 });
  });
});
