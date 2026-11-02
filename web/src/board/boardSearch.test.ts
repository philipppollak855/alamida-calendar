import { describe, expect, it } from 'vitest';
import { matchSterbefallQuery } from './boardSearch';
import type { Sterbefall } from '../types';

describe('matchSterbefallQuery', () => {
  it('findet nach Name und Fall-Nr.', () => {
    const fall = {
      id: '1',
      verstorbenerName: 'Franz Kerschhofer',
      sterbefallId: '260200',
    } as Sterbefall;
    expect(matchSterbefallQuery(fall, 'kerschhofer')).toBe(true);
    expect(matchSterbefallQuery(fall, '260200')).toBe(true);
    expect(matchSterbefallQuery(fall, '260200 kersch')).toBe(true);
    expect(matchSterbefallQuery(fall, 'wolfsberg')).toBe(false);
  });

  it('findet abgeschlossene Fälle nach Abschlussgrund', () => {
    const fall = {
      id: '2',
      verstorbenerName: 'Anna Muster',
      sterbefallId: '260300',
      historieGrund: 'uebergabe_anderer_bestatter',
      inHistory: true,
    } as Sterbefall;
    expect(matchSterbefallQuery(fall, 'anna')).toBe(true);
    expect(matchSterbefallQuery(fall, 'übergabe')).toBe(true);
    expect(matchSterbefallQuery(fall, '260300')).toBe(true);
  });
});
