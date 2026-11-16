import { describe, expect, it } from 'vitest';
import { faelleAus } from './telefon';

describe('faelleAus', () => {
  it('fasst je Fall zusammen, aktive zuerst, dann nach letztem Termin', () => {
    const r = faelleAus(
      [
        { fall: '1', name: 'Anna Bauer', tag: '2026-03-01' },
        { fall: '1', name: 'Anna Bauer', tag: '2026-03-05' },
        { fall: '2', name: 'Karl Huber', tag: '2026-11-20' },
        { name: 'Maria Lang', tag: '2026-06-01' },
        { fall: '3', name: '  ', tag: '2026-11-16' },
      ],
      '2026-11-16',
    );
    expect(r).toEqual([
      { name: 'Karl Huber', zuletzt: '2026-11-20', aktiv: true },
      { name: 'Maria Lang', zuletzt: '2026-06-01', aktiv: false },
      { name: 'Anna Bauer', zuletzt: '2026-03-05', aktiv: false },
    ]);
  });

  it('zählt Termine der letzten 7 Tage als aktiv', () => {
    expect(faelleAus([{ fall: '9', name: 'X', tag: '2026-11-10' }], '2026-11-16')[0].aktiv).toBe(true);
    expect(faelleAus([{ fall: '9', name: 'X', tag: '2026-11-08' }], '2026-11-16')[0].aktiv).toBe(false);
  });
});
