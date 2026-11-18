import { describe, expect, it } from 'vitest';
import { darfAnlegen, googleEreignis, neuerTerminPruefen, rrule, standardDauer, terminSichtbar, zielKalender } from './neuerTermin';
import { KATEGORIE_SCHLUESSEL, STANDARD_KONFIG, type Rechte } from './rechte';

const r = (x: Partial<Rechte>): Rechte => ({ email: 'a@x.at', admin: false, freigeschaltet: true, gruppen: [], kategorien: [], kalender: [], ...x });

describe('neuer Termin', () => {
  it('prüft die Eingaben', () => {
    expect(neuerTerminPruefen({ kategorie: 'Gibtsnicht', titel: 'x', datum: '2026-11-03' }, KATEGORIE_SCHLUESSEL)).toEqual({ fehler: 'Bitte eine Kategorie wählen' });
    expect('fehler' in neuerTerminPruefen({ kategorie: 'Beisetzung', titel: '', datum: '2026-11-03' }, KATEGORIE_SCHLUESSEL)).toBe(true);
    expect('fehler' in neuerTerminPruefen({ kategorie: 'Beisetzung', titel: 'Huber', datum: '3.11.2026' }, KATEGORIE_SCHLUESSEL)).toBe(true);
    expect('fehler' in neuerTerminPruefen({ kategorie: 'Beisetzung', titel: 'Huber', datum: '2026-11-03', zeit: '25:00', dauer: 60 }, KATEGORIE_SCHLUESSEL)).toBe(true);
    expect('fehler' in neuerTerminPruefen({ kategorie: 'Beisetzung', titel: 'Huber', datum: '2026-11-03', zeit: '10:00', dauer: 0 }, KATEGORIE_SCHLUESSEL)).toBe(true);
    expect(neuerTerminPruefen({ kategorie: 'Beisetzung', titel: ' Huber ', datum: '2026-11-03', zeit: '10:00', dauer: 45, ort: 'Friedhof' }, KATEGORIE_SCHLUESSEL)).toEqual({
      termin: { kategorie: 'Beisetzung', titel: 'Huber', datum: '2026-11-03', zeit: '10:00', dauer: 45, ort: 'Friedhof' },
    });
  });

  it('baut das Google-Ereignis in Wiener Zeit, auch über Mitternacht und ganztägig', () => {
    const e = googleEreignis({ kategorie: 'Ueberfuehrung', titel: 'Huber', datum: '2026-12-31', zeit: '23:30', dauer: 120 }, { symbol: '🚗', label: 'Überführung' }, { email: 'a@x.at', name: 'Anna' });
    expect(e.summary).toBe('🚗 Überführung Huber');
    expect(e.start).toEqual({ dateTime: '2026-12-31T23:30:00', timeZone: 'Europe/Vienna' });
    expect(e.end).toEqual({ dateTime: '2027-01-01T01:30:00', timeZone: 'Europe/Vienna' });
    expect(e.extendedProperties.private).toEqual({ kategorie: 'Ueberfuehrung', quelle: 'web', angelegtVon: 'a@x.at' });
    const g = googleEreignis({ kategorie: 'Sonstiges', titel: 'Fortbildung', datum: '2026-02-28', dauer: 0 }, { symbol: '📌', label: 'Sonstiges' }, { email: 'a@x.at' });
    expect(g.start).toEqual({ date: '2026-02-28' });
    expect(g.end).toEqual({ date: '2026-03-01' });
  });

  it('Ziel-Kalender und Dauer wie beim Agent', () => {
    const k = { ...STANDARD_KONFIG, kalender: [{ id: 'k1', name: 'K1' }], agent: { standardKalender: 'primary', kategorien: { Beisetzung: { kalender: 'k2', dauer: 90 } } } };
    expect(zielKalender(k, 'Beisetzung')).toBe('k2');
    expect(zielKalender(k, 'Rosenkranz')).toBe('k1');
    expect(standardDauer(k, 'Beisetzung')).toBe(90);
    expect(standardDauer(k, 'Ueberfuehrung')).toBe(120);
    expect(standardDauer(k, 'Rosenkranz')).toBe(60);
  });

  it('nur Admins und gewählte Gruppen dürfen anlegen', () => {
    const k = { ...STANDARD_KONFIG, anlegenGruppen: ['buero'] };
    expect(darfAnlegen(r({ admin: true }), k)).toBe(true);
    expect(darfAnlegen(r({ gruppen: ['buero'] }), k)).toBe(true);
    expect(darfAnlegen(r({ gruppen: ['fahrer'] }), k)).toBe(false);
  });

  it('Serie, Checkliste und Sichtbarkeit', () => {
    const p = neuerTerminPruefen(
      { kategorie: 'Sonstiges', titel: 'Reinigung', datum: '2026-11-02', dauer: 0, wiederholung: { art: 'woechentlich', alle: 2, tage: [3, 0, 3], bis: '2026-12-31' }, checkliste: ['Boden', ' Boden ', 'Fenster'], sichtGruppen: ['team'], sichtPersonen: ['B@X.at'] },
      KATEGORIE_SCHLUESSEL,
    );
    if (!('termin' in p)) throw new Error(p.fehler);
    expect(p.termin.wiederholung).toEqual({ art: 'woechentlich', alle: 2, tage: [0, 3], bis: '2026-12-31' });
    expect(p.termin.checkliste).toEqual(['Boden', 'Fenster']);
    const e = googleEreignis(p.termin, { symbol: '📌', label: 'Sonstiges' }, { email: 'a@x.at' });
    expect(e.recurrence).toEqual(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261231']);
    expect(rrule({ art: 'monatlich', alle: 1, bis: '2027-01-01' }, false)).toBe('RRULE:FREQ=MONTHLY;UNTIL=20270101T225959Z');
    expect(rrule({ art: 'taeglich', alle: 1, bis: '2027-07-01' }, false)).toBe('RRULE:FREQ=DAILY;UNTIL=20270701T215959Z');
    const priv = e.extendedProperties.private;
    expect(terminSichtbar(r({ email: 'c@x.at' }), priv)).toBe(false);
    expect(terminSichtbar(r({ email: 'c@x.at', gruppen: ['team'] }), priv)).toBe(true);
    expect(terminSichtbar(r({ email: 'b@x.at' }), priv)).toBe(true);
    expect(terminSichtbar(r({ email: 'a@x.at' }), priv)).toBe(true);
    expect(terminSichtbar(r({ email: 'c@x.at', admin: true }), priv)).toBe(true);
    expect(terminSichtbar(r({ email: 'c@x.at' }), { kategorie: 'Sonstiges' })).toBe(true);
    expect('fehler' in neuerTerminPruefen({ kategorie: 'Sonstiges', titel: 'x', datum: '2026-11-02', wiederholung: { art: 'jährlich' } }, KATEGORIE_SCHLUESSEL)).toBe(true);
  });
});
