import { useCallback, useEffect, useState } from 'react';
import {
  ALL_CALENDAR_TERMIN_ARTEN,
  type CalendarTerminArt,
  isCalendarFilterComplete,
  isCalendarTerminArt,
} from '../board/wallCalendar';

const STORAGE_KEY = 'alamida-wall-cal-art-filter-v3';

function loadFromStorage(): Set<CalendarTerminArt> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(ALL_CALENDAR_TERMIN_ARTEN);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set(ALL_CALENDAR_TERMIN_ARTEN);
    const valid = parsed.filter(isCalendarTerminArt);
    const set = valid.length > 0 ? new Set(valid) : new Set(ALL_CALENDAR_TERMIN_ARTEN);
    return isCalendarFilterComplete(set) ? set : new Set(ALL_CALENDAR_TERMIN_ARTEN);
  } catch {
    return new Set(ALL_CALENDAR_TERMIN_ARTEN);
  }
}

function saveToStorage(active: Set<CalendarTerminArt>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...active]));
}

export function useCalendarArtFilter() {
  const [activeArts, setActiveArts] = useState<Set<CalendarTerminArt>>(loadFromStorage);

  useEffect(() => {
    saveToStorage(activeArts);
  }, [activeArts]);

  const toggle = useCallback((art: CalendarTerminArt) => {
    setActiveArts((prev) => {
      const next = new Set(prev);
      if (next.has(art)) {
        if (next.size <= 1) return prev;
        next.delete(art);
      } else {
        next.add(art);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setActiveArts(new Set(ALL_CALENDAR_TERMIN_ARTEN));
  }, []);

  const isActive = useCallback((art: CalendarTerminArt) => activeArts.has(art), [activeArts]);

  return { activeArts, toggle, selectAll, isActive };
}
