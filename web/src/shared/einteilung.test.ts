import { describe, expect, it } from 'vitest';
import { darfEinteilen, einteilungFehler, maxPersonen, terminTeile } from './einteilung';
import { STANDARD_KONFIG, type Rechte } from './rechte';

const bekannt = new Set(['a@x.at', 'b@x.at', 'c@x.at', 'd@x.at', 'e@x.at', 'f@x.at']);
const rechte = (r: Partial<Rechte>): Rechte => ({ admin: false, freigeschaltet: true, gruppen: [], kategorien: [], kalender: [], ...r }) as Rechte;

describe('Personalplanung', () => {
  it('Gespräch eine Person, sonst höchstens 5', () => {
    expect(maxPersonen('Trauergespraech')).toBe(1);
    expect(maxPersonen('Vorsorge')).toBe(1);
    expect(maxPersonen('Beisetzung')).toBe(5);
    expect(maxPersonen('Ueberfuehrung')).toBe(5);
    expect(einteilungFehler('Trauergespraech', ['a@x.at', 'b@x.at'], bekannt)).toMatch(/eine Person/);
    expect(einteilungFehler('Trauergespraech', ['a@x.at'], bekannt)).toBeNull();
    expect(einteilungFehler('Beisetzung', ['a@x.at', 'b@x.at', 'c@x.at', 'd@x.at', 'e@x.at'], bekannt)).toBeNull();
    expect(einteilungFehler('Beisetzung', [...bekannt], bekannt)).toMatch(/Höchstens 5/);
  });
  it('lehnt doppelte und unbekannte Personen ab', () => {
    expect(einteilungFehler('Beisetzung', ['a@x.at', 'a@x.at'], bekannt)).toMatch(/doppelt/);
    expect(einteilungFehler('Beisetzung', ['z@x.at'], bekannt)).toMatch(/Unbekannt/);
  });
  it('nur Admins und gewählte Gruppen dürfen einteilen', () => {
    const k = { ...STANDARD_KONFIG, personalGruppen: ['buero'] };
    expect(darfEinteilen(rechte({ admin: true }), k)).toBe(true);
    expect(darfEinteilen(rechte({ gruppen: ['buero'] }), k)).toBe(true);
    expect(darfEinteilen(rechte({ gruppen: ['fahrer'] }), k)).toBe(false);
    expect(darfEinteilen(rechte({ gruppen: ['buero'], freigeschaltet: false }), k)).toBe(false);
  });
  it('zerlegt Termin-IDs', () => {
    expect(terminTeile('abc@group.calendar.google.com/ev1')).toEqual({ kalenderId: 'abc@group.calendar.google.com', eventId: 'ev1' });
    expect(terminTeile('ohneTrenner')).toBeNull();
    expect(terminTeile('/x')).toBeNull();
  });
});
