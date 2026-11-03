import { describe, expect, it } from 'vitest';
import type { Abwesenheit } from './abwesenheit';
import { abwesendHeute, bereitschaftHeute, heuteText, ortszeit, termineHeute } from './heute';

const O = 'https://kal.app';
const ich = 'anna@x.at';

describe('Tagesübersicht für den Hub', () => {
  it('rechnet in Wiener Ortszeit', () => {
    expect(ortszeit(new Date('2026-11-02T23:30:00Z'))).toBe('2026-11-03T00:30');
    expect(heuteText(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
  });

  it('nimmt nur heutige Termine, ganztägige zuerst, mit Direktlink', () => {
    const ev = (id: string, start: object, end: object, extra = {}) => ({ kalenderId: 'k1', kategorie: 'Beisetzung', event: { id, start, end, ...extra } });
    const l = termineHeute(
      [
        ev('a', { dateTime: '2026-11-02T14:00:00+01:00' }, { dateTime: '2026-11-02T15:00:00+01:00' }, { attendees: [{ email: 'Anna@x.at' }] }),
        ev('b', { dateTime: '2026-11-03T09:00:00+01:00' }, { dateTime: '2026-11-03T10:00:00+01:00' }),
        ev('c', { date: '2026-11-02' }, { date: '2026-11-03' }),
        ev('d', { date: '2026-11-01' }, { date: '2026-11-02' }),
        ev('e', { dateTime: '2026-11-01T23:00:00+01:00' }, { dateTime: '2026-11-02T01:00:00+01:00' }),
        ev('f', { dateTime: '2026-11-02T08:00:00+01:00' }, { dateTime: '2026-11-02T09:00:00+01:00' }, { status: 'cancelled' }),
      ],
      '2026-11-02',
      ich,
      O,
    );
    expect(l.map((x) => x.id)).toEqual(['k1/c', 'k1/e', 'k1/a']);
    expect(l[2]).toMatchObject({ meins: true, von: '2026-11-02T14:00', ziel: `${O}/?tag=2026-11-02&termin=k1%2Fa` });
  });

  it('zeigt heutige Bereitschaft, endet sie um 00:00 nicht am Folgetag', () => {
    const e = [
      { id: '1', email: ich, von: '2026-10-30T00:00', bis: '2026-11-02T00:00' },
      { id: '2', email: 'max@x.at', name: 'Max', von: '2026-11-02T08:00', bis: '2026-11-02T20:00' },
    ];
    const l = bereitschaftHeute(e, '2026-11-02', ich, O, new Map());
    expect(l.map((x) => [x.titel, x.meins])).toEqual([['Max', false]]);
    expect(bereitschaftHeute(e, '2026-11-01', ich, O, new Map([[ich, 'Anna']]))[0]).toMatchObject({ titel: 'Anna', meins: true });
  });

  it('verdeckt fremde Abwesenheiten ohne Verwaltungsrecht und zeigt eigene Anträge', () => {
    const a = (id: string, email: string, status: Abwesenheit['status'], art: Abwesenheit['art'] = 'urlaub'): Abwesenheit => ({ id, email, art, von: '2026-11-01', bis: '2026-11-03', status });
    const liste = [a('1', 'max@x.at', 'gemeldet', 'krank'), a('2', ich, 'beantragt'), a('3', 'eva@x.at', 'beantragt'), a('4', 'eva@x.at', 'abgelehnt')];
    const namen = new Map([['max@x.at', 'Max']]);
    expect(abwesendHeute(liste, '2026-11-02', ich, false, O, namen).map((x) => x.titel)).toEqual(['Max – abwesend', 'anna@x.at – Urlaub (beantragt)']);
    expect(abwesendHeute(liste, '2026-11-02', ich, true, O, namen)[0].titel).toBe('Max – Krank');
    expect(abwesendHeute(liste, '2026-11-04', ich, true, O, namen)).toEqual([]);
  });
});

describe('Sterbefall im Tagesplan', () => {
  it('kennzeichnet Termine eines Sterbefalls', () => {
    const ev = (id: string, h: string, description?: string) => ({
      kalenderId: 'k',
      kategorie: 'Abholung',
      event: { id, summary: 'x', start: { dateTime: `2026-05-26T${h}:00+02:00` }, end: { dateTime: `2026-05-26T${h}:30+02:00` }, description },
    });
    const l = termineHeute([ev('a', '08:00', 'Sterbefall: 260251 | Anna Muster'), ev('b', '09:00')], '2026-05-26', 'ich@x.at', 'https://k');
    expect(l[0]).toMatchObject({ fall: '260251', verstorbener: 'Anna Muster' });
    expect(l[1].fall).toBeUndefined();
  });
});
