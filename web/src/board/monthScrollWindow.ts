import { addDays, dayKeyFromDate, startOfWeekMonday } from './dateUtils';

export interface WallCalendarDayRange {
  fromKey: string;
  toKey: string;
}

function dateFromDayKey(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Mo–So der Woche, die den Ankertag enthält. */
export function currentWeekDayRange(anchor: Date): WallCalendarDayRange {
  const local = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const monday = startOfWeekMonday(local);
  return {
    fromKey: dayKeyFromDate(monday),
    toKey: dayKeyFromDate(addDays(monday, 6)),
  };
}

export function expandMonthWindowBackward(
  range: WallCalendarDayRange,
  chunkWeeks = 2
): WallCalendarDayRange {
  return {
    fromKey: dayKeyFromDate(addDays(dateFromDayKey(range.fromKey), -chunkWeeks * 7)),
    toKey: range.toKey,
  };
}

export function expandMonthWindowForward(
  range: WallCalendarDayRange,
  chunkWeeks = 2
): WallCalendarDayRange {
  return {
    fromKey: range.fromKey,
    toKey: dayKeyFromDate(addDays(dateFromDayKey(range.toKey), chunkWeeks * 7)),
  };
}

export function countDaysBetweenKeys(fromKey: string, toKey: string): number {
  const diff = dateFromDayKey(toKey).getTime() - dateFromDayKey(fromKey).getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / 86400000) + 1;
}

/** Tage, die beim Nachladen nach oben hinzukommen. */
export function daysPrependedBackward(
  previous: WallCalendarDayRange,
  next: WallCalendarDayRange
): number {
  if (next.fromKey >= previous.fromKey) return 0;
  const lastNew = dayKeyFromDate(addDays(dateFromDayKey(previous.fromKey), -1));
  return countDaysBetweenKeys(next.fromKey, lastNew);
}
