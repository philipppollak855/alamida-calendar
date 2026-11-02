import { describe, it, expect } from 'vitest';
import {
  calendarDayLayout,
  calendarEventFlexClass,
  monthGridScrollTop,
} from './wallCalendarLayout';
import type { WallCalendarEntry } from './wallCalendar';

function entry(arts: WallCalendarEntry['arts']): WallCalendarEntry {
  return {
    id: '1',
    docId: '1',
    sterbefallId: '1',
    dayKey: '2026-05-28',
    dayLabel: '',
    timeLabel: '14:00',
    sortMs: 0,
    name: 'Test',
    title: 'Trauerfeier',
    subtitle: '',
    badges: ['Trauerfeier'],
    grouped: false,
    arts,
    searchText: '',
  };
}

describe('wallCalendarLayout', () => {
  it('markiert Überführung als halbe Höhe', () => {
    expect(calendarEventFlexClass(entry(['ueberfuehrung']))).toBe('wall-cal-event--half');
    expect(calendarEventFlexClass(entry(['ueberfuehrung_kremation']))).toBe(
      'wall-cal-event--half'
    );
    expect(calendarEventFlexClass(entry(['trauerfeier']))).toBe('wall-cal-event--full');
    expect(calendarEventFlexClass(entry(['aufnahme']))).toBe('wall-cal-event--half');
  });

  it('skaliert Schrift bei vielen gewichteten Slots runter', () => {
    const many = [
      entry(['ueberfuehrung']),
      entry(['ueberfuehrung']),
      entry(['ueberfuehrung']),
      entry(['trauerfeier']),
      entry(['beisetzung']),
      entry(['ueberfuehrung']),
    ];
    const { densityScale, slotWeight } = calendarDayLayout(many);
    expect(slotWeight).toBe(8);
    expect(densityScale).toBeLessThan(1);
    expect(densityScale).toBeGreaterThanOrEqual(0.5);

    const compact = calendarDayLayout(many, 'stripCompact');
    expect(compact.densityScale).toBeLessThan(densityScale);
    expect(compact.densityScale).toBeGreaterThanOrEqual(0.32);
  });

  it('berechnet Monats-Scroll so dass der Fokustag zentriert wird', () => {
    const columns = 7;
    const rowHeight = 200;
    const viewportHeight = 400;
    const index = 14;
    const top = monthGridScrollTop(index, columns, rowHeight, viewportHeight);
    expect(top).toBe(2 * rowHeight - viewportHeight / 2 + rowHeight / 2);
  });
});
