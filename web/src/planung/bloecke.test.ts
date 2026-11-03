import { describe, expect, it } from 'vitest';
import { ausGoogleEvent, bloecke, istFall, kalenderEintraege, ketteVon, type GoogleEvent } from './planungLogic';

const ev = (id: string, kat: string, start: string, fall?: string): GoogleEvent => ({
  id,
  summary: `${kat} Test`,
  description: fall ? `Sterbefall: ${fall}` : '',
  start: { dateTime: start },
  end: { dateTime: start.replace(/T(\d\d)/, (_, h: string) => `T${String(Number(h) + 1).padStart(2, '0')}`) },
  extendedProperties: { private: { kategorie: kat, ...(fall ? { sterbefallId: fall.split(' | ')[0] } : {}) } },
});
const t = (e: GoogleEvent) => ausGoogleEvent(e, 'cal', 'Kalender')!;

describe('bloecke', () => {
  it('fasst Termine desselben Sterbefalls zu einer Karte zusammen, in zeitlicher Reihenfolge', () => {
    const l = [
      t(ev('b', 'Beisetzung', '2026-05-28T14:00:00+02:00', '1 | Anton Huber')),
      t(ev('x', 'Trauergespraech', '2026-05-28T09:00:00+02:00')),
      t(ev('a', 'Ueberfuehrung', '2026-05-28T08:00:00+02:00', '1 | Anton Huber')),
      t(ev('c', 'Trauerfeier', '2026-05-28T13:00:00+02:00', '1 | Anton Huber')),
      t(ev('y', 'Abholung', '2026-05-28T11:00:00+02:00', '2 | Maria Berger')),
    ];
    const r = bloecke(l);
    expect(r.map((b) => b.art)).toEqual(['fall', 'einzel', 'einzel']);
    const f = r[0];
    if (f.art !== 'fall') throw new Error();
    expect(f.name).toBe('Anton Huber');
    expect(f.sterbefallId).toBe('1');
    expect(f.termine.map((x) => x.kategorie)).toEqual(['Ueberfuehrung', 'Trauerfeier', 'Beisetzung']);
  });

  it('ein einzelner Termin eines Falls bleibt eine normale Karte', () => {
    expect(bloecke([t(ev('a', 'Beisetzung', '2026-05-28T14:00:00+02:00', '1 | Anton Huber'))])[0].art).toBe('einzel');
  });
});

describe('kalenderEintraege', () => {
  it('bündelt zusammenhängende Termine eines Sterbefalls am selben Tag zu einem Block', () => {
    const l = [
      t(ev('a', 'Ueberfuehrung', '2026-05-26T08:00:00+02:00', '1 | Anton Huber')),
      t(ev('b', 'Rosenkranz', '2026-05-26T10:00:00+02:00', '1 | Anton Huber')),
      t(ev('c', 'Beisetzung', '2026-05-26T11:00:00+02:00', '1 | Anton Huber')),
      t(ev('d', 'Trauerfeier', '2026-05-26T16:00:00+02:00', '1 | Anton Huber')),
      t(ev('e', 'Beisetzung', '2026-05-27T14:00:00+02:00', '1 | Anton Huber')),
      t(ev('g', 'Trauergespraech', '2026-05-26T09:00:00+02:00', '1 | Anton Huber')),
      t(ev('x', 'Abholung', '2026-05-26T09:00:00+02:00')),
    ];
    const r = kalenderEintraege(l, true);
    const f = r.filter(istFall);
    expect(f).toHaveLength(1);
    expect(f[0].termine.map((x) => x.id)).toEqual(['cal/a', 'cal/b', 'cal/c']);
    expect(f[0].ganztaegig).toBe(false);
    expect(f[0].start.toISOString()).toBe(new Date('2026-05-26T08:00:00+02:00').toISOString());
    expect(f[0].ende.toISOString()).toBe(new Date('2026-05-26T12:00:00+02:00').toISOString());
    expect(r).toHaveLength(5);
    expect(ketteVon(l, l[1])?.length).toBe(3);
    expect(ketteVon(l, l[3])).toBeNull();
    expect(kalenderEintraege(l, false)).toHaveLength(7);
  });
});
