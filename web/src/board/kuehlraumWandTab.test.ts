import { describe, expect, it } from 'vitest';
import type { EigenerKuehlraumConfig } from '../types/dispositionSettings';
import { filterKuehlraeumeFuerWandTab } from './kuehlraumWandTab';

const kuehlraeume: EigenerKuehlraumConfig[] = [
  {
    id: 'a',
    label: 'Grafenbach',
    matchKeywords: ['grafenbach'],
    externKeywords: [],
    wandTab: 'kuehlraum',
    plaetze: 9,
  },
  {
    id: 'b',
    label: 'Wien',
    matchKeywords: ['wien'],
    externKeywords: [],
    wandTab: 'extern',
    plaetze: 4,
  },
];

describe('filterKuehlraeumeFuerWandTab', () => {
  it('filtert nach Wand-Tab', () => {
    expect(filterKuehlraeumeFuerWandTab(kuehlraeume, 'kuehlraum').map((k) => k.id)).toEqual(['a']);
    expect(filterKuehlraeumeFuerWandTab(kuehlraeume, 'extern').map((k) => k.id)).toEqual(['b']);
  });
});
