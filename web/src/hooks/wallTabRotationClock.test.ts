import { describe, it, expect } from 'vitest';
import { splitDurationAcrossSlides, wallRotationEpochForSlide, wallRotationPosition } from './wallTabRotationClock';

const views = ['kuehlraum', 'extern', 'kalender'] as const;
const durations = { kuehlraum: 10, extern: 20, kalender: 30, abholungen: 10, offen: 10 };

describe('splitDurationAcrossSlides', () => {
  it('teilt Gesamtzeit gleichmäßig auf', () => {
    expect(splitDurationAcrossSlides(18, 2)).toEqual([9, 9]);
    expect(splitDurationAcrossSlides(18, 3)).toEqual([6, 6, 6]);
    expect(splitDurationAcrossSlides(18, 4)).toEqual([5, 5, 4, 4]);
    expect(splitDurationAcrossSlides(18, 4).reduce((a, b) => a + b, 0)).toBe(18);
  });
});

describe('wallRotationPosition', () => {
  const epoch = 0;

  it('startet auf erster Slide', () => {
    expect(wallRotationPosition(epoch, 5000, [...views], durations)).toEqual({
      slide: 0,
      secondsLeft: 5,
    });
  });

  it('wechselt nach Summe der Dauer zur nächsten Slide', () => {
    expect(wallRotationPosition(epoch, 10_000, [...views], durations).slide).toBe(1);
    expect(wallRotationPosition(epoch, 29_000, [...views], durations).slide).toBe(1);
    expect(wallRotationPosition(epoch, 30_000, [...views], durations).slide).toBe(2);
  });

  it('läuft Zyklus nach Gesamtdauer wieder von vorn', () => {
    expect(wallRotationPosition(epoch, 60_000, [...views], durations).slide).toBe(0);
  });

  it('epochForSlide und Position sind konsistent', () => {
    const now = 1_700_000_000_000;
    const slide = 2;
    const epochForSlide = wallRotationEpochForSlide(slide, now, [...views], durations);
    expect(wallRotationPosition(epochForSlide, now, [...views], durations).slide).toBe(slide);
  });
});
