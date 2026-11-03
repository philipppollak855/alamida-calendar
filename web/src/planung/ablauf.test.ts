import { describe, expect, it } from 'vitest';
import { ablaufId } from '../shared/einteilung';
import { termineHeute } from '../shared/heute';
import { ausGoogleEvent, mitAblaufEinteilung, mitTerminEinteilung, personalZuordnen, type GoogleEvent } from './planungLogic';

const ev = (id: string, kat: string, start: string, fall?: string): GoogleEvent => ({
  id,
  summary: `${kat} Test`,
  description: fall ? `Sterbefall: ${fall}` : '',
  start: { dateTime: start },
  end: { dateTime: start.replace(/T(\d\d)/, (_, h: string) => `T${String(Number(h) + 1).padStart(2, '0')}`) },
  extendedProperties: { private: { kategorie: kat, ...(fall ? { sterbefallId: fall.split(' | ')[0] } : {}) } },
});
const events = [
  ev('a', 'Ueberfuehrung', '2026-05-26T08:00:00+02:00', '1 | Anton Huber'),
  ev('b', 'Rosenkranz', '2026-05-26T10:00:00+02:00', '1 | Anton Huber'),
  ev('c', 'Trauergespraech', '2026-05-26T12:00:00+02:00', '1 | Anton Huber'),
  ev('d', 'Beisetzung', '2026-05-27T10:00:00+02:00', '1 | Anton Huber'),
];
const X = [{ email: 'x@a.at' }];
const Y = [{ email: 'y@a.at' }];
const m = new Map([
  [ablaufId('1', '2026-05-26'), X],
  ['cal/b', Y],
]);

describe('Ablauf-Personal', () => {
  const [a, b, c, d] = events.map((e) => personalZuordnen(ausGoogleEvent(e, 'cal', 'Kalender')!, m));

  it('gilt für alle Untertermine des Tages, sofern nicht abweichend eingeteilt', () => {
    expect(a.personal).toEqual(X);
    expect(a.personalQuelle).toBe('fall');
    expect(b.personal).toEqual(Y);
    expect(b.personalQuelle).toBe('termin');
    expect(b.ablaufPersonal).toEqual(X);
    expect(c.personal).toBeUndefined();
    expect(d.personal).toBeUndefined();
  });

  it('aktualisiert Ablauf und abweichende Termine getrennt', () => {
    expect(mitAblaufEinteilung(a, '1', '2026-05-26', Y).personal).toEqual(Y);
    expect(mitAblaufEinteilung(b, '1', '2026-05-26', [])).toMatchObject({ personal: Y, ablaufPersonal: undefined });
    expect(mitAblaufEinteilung(d, '1', '2026-05-26', Y)).toBe(d);
    expect(mitTerminEinteilung(b, 'cal/b', [])).toMatchObject({ personal: X, personalQuelle: 'fall' });
  });

  it('Hub „Heute“: Ablauf-Personal sieht seine Termine als „für dich“', () => {
    const l = termineHeute(
      events.map((event) => ({ kalenderId: 'cal', event, kategorie: event.extendedProperties!.private!.kategorie })),
      '2026-05-26',
      'x@a.at',
      'https://k',
      m,
    );
    expect(l.filter((e) => e.meins).map((e) => e.id)).toEqual(['cal/a']);
  });
});
