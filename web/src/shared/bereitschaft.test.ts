import { describe, expect, it } from 'vitest';
import { darfPlanen, dienste, einsatzFehler, feiertage, gleichzeitig, jahresUebersicht, ostersonntag, type Einsatz } from './bereitschaft';
import { STANDARD_KONFIG, rechteFuer } from './rechte';

const e = (email: string, von: string, bis: string): Einsatz => ({ id: email + von, email, von, bis, eingetragenVon: email });

describe('Feiertage', () => {
  it('berechnet Ostern und bewegliche Feiertage', () => {
    expect(ostersonntag(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
    const f = feiertage(2026);
    expect(f.find((x) => x.name === 'Ostermontag')?.datum).toBe('2026-04-06');
    expect(f.find((x) => x.name === 'Christi Himmelfahrt')?.datum).toBe('2026-05-14');
    expect(f.find((x) => x.name === 'Pfingstmontag')?.datum).toBe('2026-05-25');
    expect(f.find((x) => x.name === 'Fronleichnam')?.datum).toBe('2026-06-04');
    expect(f).toHaveLength(13);
  });
});

describe('Dienste', () => {
  it('Wochenenden Fr–So und Feiertage Mo–Do', () => {
    const d = dienste(new Date(2026, 9, 24), new Date(2026, 10, 9));
    expect(d.map((x) => x.id)).toEqual(['we-2026-10-23', 'ft-2026-10-26', 'we-2026-10-30', 'we-2026-11-06']);
    expect(d[0]).toMatchObject({ von: '2026-10-23T00:00', bis: '2026-10-26T00:00' });
    expect(d[2].feiertage).toEqual(['Allerheiligen']);
  });
  it('Weihnachten: Christtag Fr im Wochenende, keine Doppelung', () => {
    const d = dienste(new Date(2026, 11, 21), new Date(2026, 11, 31));
    expect(d.map((x) => x.id)).toEqual(['we-2026-12-25']);
    expect(d[0].feiertage).toEqual(['Christtag', 'Stefanitag']);
  });
});

describe('Einteilung', () => {
  const liste = [
    e('a@x.at', '2026-11-06T00:00', '2026-11-09T00:00'),
    e('b@x.at', '2026-11-07T08:00', '2026-11-07T20:00'),
    e('c@x.at', '2026-11-07T18:00', '2026-11-08T08:00'),
  ];
  it('zählt gleichzeitige Personen', () => {
    expect(gleichzeitig(liste, { von: '2026-11-07T19:00', bis: '2026-11-07T21:00' })).toBe(4);
    expect(gleichzeitig(liste, { von: '2026-11-08T10:00', bis: '2026-11-08T12:00' })).toBe(2);
  });
  it('höchstens 3 gleichzeitig, nur Wochenende/Feiertag, keine Doppeleinträge', () => {
    expect(einsatzFehler(liste, { email: 'd@x.at', von: '2026-11-07T19:00', bis: '2026-11-07T21:00' })).toMatch(/Höchstens 3/);
    expect(einsatzFehler(liste, { email: 'd@x.at', von: '2026-11-07T20:00', bis: '2026-11-08T00:00' })).toBeNull();
    expect(einsatzFehler(liste, { email: 'd@x.at', von: '2026-11-08T08:00', bis: '2026-11-09T00:00' })).toBeNull();
    expect(einsatzFehler(liste, { email: 'd@x.at', von: '2026-11-04T08:00', bis: '2026-11-04T10:00' })).toMatch(/nur an Wochenenden/);
    expect(einsatzFehler(liste, { email: 'd@x.at', von: '2026-11-08T08:00', bis: '2026-11-09T08:00' })).toMatch(/nur an Wochenenden/);
    expect(einsatzFehler(liste, { email: 'a@x.at', von: '2026-11-08T08:00', bis: '2026-11-08T09:00' })).toMatch(/bereits/);
    expect(einsatzFehler([], { email: 'd@x.at', von: '2026-10-26T00:00', bis: '2026-10-27T00:00' })).toBeNull();
    expect(einsatzFehler([], { email: 'd@x.at', von: '2026-11-06T25:00', bis: '2026-11-07T02:00' })).toMatch(/Ungültig/);
    expect(einsatzFehler([], { email: 'd@x.at', von: '2026-11-06T10:00', bis: '2026-11-06T09:00' })).toMatch(/Ungültig/);
  });
  it('Planungsrecht über Admin oder Gruppe', () => {
    const k = { ...STANDARD_KONFIG, benutzer: [{ email: 'b@x.at', gruppen: ['buero'] }, { email: 'f@x.at', gruppen: ['fahrer'] }], bereitschaftGruppen: ['buero'] };
    expect(darfPlanen(rechteFuer('b@x.at', k), k)).toBe(true);
    expect(darfPlanen(rechteFuer('f@x.at', k), k)).toBe(false);
    expect(darfPlanen(rechteFuer('chef@x.at', k, ['chef@x.at']), k)).toBe(true);
  });
});

describe('jahresUebersicht', () => {
  it('ein Wochenende aus mehreren Teilen zählt als ganzes', () => {
    const [x] = jahresUebersicht(
      [e('c@x.at', '2026-10-30T00:00', '2026-10-31T12:00'), e('c@x.at', '2026-10-31T12:00', '2026-11-02T00:00')],
      2026,
      '2026-01-01T00:00',
    );
    expect(x).toMatchObject({ ganzeWochenenden: 1, tage: 3, feiertage: 1 });
  });
  const liste: Einsatz[] = [
    { ...e('a@x.at', '2026-01-02T00:00', '2026-01-05T00:00'), name: 'Anna' },
    e('a@x.at', '2026-04-06T00:00', '2026-04-07T00:00'),
    e('b@x.at', '2026-01-03T08:00', '2026-01-03T20:00'),
    e('b@x.at', '2025-12-26T00:00', '2025-12-29T00:00'),
    e('a@x.at', '2026-12-31T00:00', '2027-01-01T00:00'),
  ];
  const u = jahresUebersicht(liste, 2026, '2026-06-01T00:00');
  it('zählt ganze Wochenenden, Bereitschaftstage und Feiertage im Jahr', () => {
    const a = u.find((p) => p.email === 'a@x.at')!;
    expect(a).toMatchObject({ name: 'Anna', einsaetze: 3, ganzeWochenenden: 1, tage: 4, feiertage: 1 });
    expect(u.find((p) => p.email === 'b@x.at')).toMatchObject({ ganzeWochenenden: 0, tage: 1, feiertage: 0 });
    expect(a.naechster?.von).toBe('2026-12-31T00:00');
  });
  it('lässt Einsätze aus anderen Jahren weg und sortiert nach Bereitschaftstagen', () => {
    expect(u.map((p) => p.email)).toEqual(['a@x.at', 'b@x.at']);
    expect(u[1]).toMatchObject({ einsaetze: 1, ganzeWochenenden: 0, tage: 1, feiertage: 0 });
    expect(u[1].naechster).toBeUndefined();
  });
});
