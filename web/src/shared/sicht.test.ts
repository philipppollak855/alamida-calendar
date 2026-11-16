import { describe, expect, it } from 'vitest';
import { sichtFuer, verzeichnisPruefen } from './rechte';
import { fallFuerMich, type Mitschrift } from './telefon';
import { terminMeins } from './heute';
import { ablaufId } from './einteilung';

describe('Sicht je Person', () => {
  const v = verzeichnisPruefen({
    gruppen: [],
    domains: [],
    benutzer: [
      { email: 'A@x.at', gruppen: [], sicht: { termine: 'eigene', bereitschaft: 'alle', telefonNurBereitschaft: true } },
      { email: 'b@x.at', gruppen: [], sicht: { termine: 'quatsch' } },
    ],
  })!;
  it('übernimmt nur gültige Werte aus dem Hub', () => {
    expect(v.benutzer[0].sicht).toEqual({ termine: 'eigene', telefonNurBereitschaft: true });
    expect(v.benutzer[1].sicht).toBeUndefined();
  });
  it('Admins sehen immer alles', () => {
    expect(sichtFuer({ email: 'a@x.at', admin: false }, v).termine).toBe('eigene');
    expect(sichtFuer({ email: 'a@x.at', admin: true }, v)).toEqual({});
  });
});

describe('fallFuerMich', () => {
  const m = (x: Partial<Mitschrift>) => ({ id: '1', art: 'sterbefall', status: 'uebergeben', ...x }) as Mitschrift;
  it('Bereitschaft sieht nur ihr übergebene Fälle', () => {
    const an = { am: 1, von: 't@x.at', an: [{ email: 'b@x.at' }] };
    expect(fallFuerMich(m({ uebergabe: an }), 'b@x.at', false)).toBe(true);
    expect(fallFuerMich(m({ uebergabe: an }), 'c@x.at', false)).toBe(false);
    expect(fallFuerMich(m({ uebergabe: { ...an, an: [] } }), 'c@x.at', false)).toBe(true);
    expect(fallFuerMich(m({ status: 'offen' }), 'b@x.at', false)).toBe(false);
    expect(fallFuerMich(m({ art: 'anliegen' }), 'b@x.at', false)).toBe(false);
    expect(fallFuerMich(m({ status: 'offen' }), 'c@x.at', true)).toBe(true);
  });
});

describe('terminMeins', () => {
  const e = { id: 'e1', start: { dateTime: '2026-11-16T10:00:00+01:00' }, end: { dateTime: '2026-11-16T11:00:00+01:00' }, extendedProperties: { private: { sterbefallId: 'S1' } } };
  it('erkennt eigene Einteilung, Ablauf des Falls und Teilnehmer', () => {
    expect(terminMeins('k', e, 'Trauerfeier', 'a@x.at', new Map([['k/e1', [{ email: 'a@x.at' }]]]))).toBe(true);
    expect(terminMeins('k', e, 'Trauerfeier', 'a@x.at', new Map([[ablaufId('S1', '2026-11-16'), [{ email: 'a@x.at' }]]]))).toBe(true);
    expect(terminMeins('k', e, 'Trauerfeier', 'a@x.at', new Map([['k/e1', [{ email: 'b@x.at' }]]]))).toBe(false);
    expect(terminMeins('k', { ...e, attendees: [{ email: 'A@x.at' }] }, 'Trauerfeier', 'a@x.at', new Map())).toBe(true);
  });
});
