import { describe, expect, it } from 'vitest';
import { auswahlFuer, mitRolle, zeremonieFehler, zeremonieMax, type MitRollen } from './rollen';
import { besetzung, einsatzFehler, uebersichtZeitraum, type Einsatz } from './bereitschaft';

const P: MitRollen[] = [
  { email: 'a@x', rollen: ['arrangeur'] },
  { email: 'i@x', rollen: ['arrangeurIA'] },
  { email: 't1@x', rollen: ['traeger', 'bereitschaft'] },
  { email: 't2@x', rollen: ['traeger'] },
  { email: 'b@x', rollen: ['berater'] },
];

describe('Rollen', () => {
  it('filtert nur, wenn die Rolle vergeben ist', () => {
    expect(mitRolle(P, 'berater').map((p) => p.email)).toEqual(['b@x']);
    expect(mitRolle(P, 'telefon')).toHaveLength(5);
    expect(auswahlFuer('gespraech', P).map((p) => p.email)).toEqual(['b@x']);
  });
  it('Zeremonie: Arrangeur zuerst, Träger nur nach Bestätigung, Rest Träger', () => {
    expect(zeremonieFehler(['a@x', 't1@x'], P)).toBeNull();
    expect(zeremonieFehler(['t1@x', 't2@x'], P)).toMatch(/Arrangeur/);
    expect(zeremonieFehler(['t1@x', 't2@x'], P, true)).toBeNull();
    expect(zeremonieFehler(['a@x', 'b@x'], P)).toMatch(/Träger/);
  });
  it('Arrangeur i.A. als 6. Person', () => {
    expect(zeremonieMax(['a@x', 't1@x'], P)).toBe(5);
    expect(zeremonieMax(['a@x', 'i@x'], P)).toBe(6);
  });
});

describe('Bereitschaft', () => {
  const we = { von: '2026-11-06T00:00', bis: '2026-11-09T00:00' };
  const e = (id: string, email: string): Einsatz => ({ id, email, ...we });
  it('vollständig ab 2, mit „braucht Dritten“ ab 3', () => {
    expect(besetzung([e('1', 'a@x')], we, new Set()).vollstaendig).toBe(false);
    expect(besetzung([e('1', 'a@x'), e('2', 'b@x')], we, new Set()).vollstaendig).toBe(true);
    expect(besetzung([e('1', 'a@x'), e('2', 'b@x')], we, new Set(['b@x']))).toMatchObject({ noetig: 3, vollstaendig: false });
  });
  it('nur Personen mit Rolle Bereitschaft', () => {
    expect(einsatzFehler([], { email: 't2@x', ...we }, P)).toMatch(/Bereitschaft/);
    expect(einsatzFehler([], { email: 't1@x', ...we }, P)).toBeNull();
  });
  it('Monatsübersicht zählt nur den Monat', () => {
    const r = uebersichtZeitraum([e('1', 'a@x')], new Date(2026, 10, 1), new Date(2026, 11, 1), '2026-01-01T00:00');
    expect(r[0]).toMatchObject({ ganzeWochenenden: 1, tage: 3 });
    expect(uebersichtZeitraum([e('1', 'a@x')], new Date(2026, 9, 1), new Date(2026, 10, 1), '2027-01-01T00:00')).toHaveLength(0);
  });
});
