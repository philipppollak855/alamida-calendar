import { describe, it, expect } from 'vitest';
import {
  currentWeekDayRange,
  daysPrependedBackward,
  expandMonthWindowBackward,
  expandMonthWindowForward,
} from './monthScrollWindow';

describe('monthScrollWindow', () => {
  it('liefert Mo–So der Ankerwoche', () => {
    const week = currentWeekDayRange(new Date(2026, 4, 28));
    expect(week.fromKey).toBe('2026-05-25');
    expect(week.toKey).toBe('2026-05-31');
  });

  it('erweitert in beide Richtungen', () => {
    const week = currentWeekDayRange(new Date(2026, 4, 28));
    const back = expandMonthWindowBackward(week, 2);
    const fwd = expandMonthWindowForward(week, 2);
    expect(back.fromKey).toBe('2026-05-11');
    expect(fwd.toKey).toBe('2026-06-14');
    expect(daysPrependedBackward(week, back)).toBe(14);
  });
});
