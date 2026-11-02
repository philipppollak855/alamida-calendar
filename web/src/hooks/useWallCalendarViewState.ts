import { useCallback, useEffect, useRef, useState } from 'react';
import { dayKeyFromDate } from '../board/dateUtils';
import type { WallCalendarRange } from '../board/wallCalendar';

const STORAGE_KEY = 'alamida-wall-cal-view-v1';

interface StoredView {
  range?: WallCalendarRange;
  search?: string;
  focusDayKey?: string | null;
}

function isRange(v: unknown): v is WallCalendarRange {
  return v === 7 || v === 14 || v === 'month';
}

function loadStored(): StoredView {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredView;
    return {
      range: isRange(parsed.range) ? parsed.range : undefined,
      search: typeof parsed.search === 'string' ? parsed.search : undefined,
      focusDayKey:
        parsed.focusDayKey === null || typeof parsed.focusDayKey === 'string'
          ? parsed.focusDayKey
          : undefined,
    };
  } catch {
    return {};
  }
}

function saveStored(state: StoredView) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useWallCalendarViewState(now: Date) {
  const stored = useRef(loadStored());
  const todayKey = dayKeyFromDate(now);

  const [range, setRangeState] = useState<WallCalendarRange>(
    () => stored.current.range ?? 7
  );
  const [search, setSearchState] = useState(() => stored.current.search ?? '');
  const [focusDayKey, setFocusDayKeyState] = useState<string | null>(
    () => stored.current.focusDayKey ?? todayKey
  );

  const setRange = useCallback((next: WallCalendarRange) => {
    setRangeState(next);
  }, []);

  const setSearch = useCallback((next: string) => {
    setSearchState(next);
  }, []);

  const setFocusDayKey = useCallback((next: string | null) => {
    setFocusDayKeyState(next);
  }, []);

  useEffect(() => {
    saveStored({ range, search, focusDayKey });
  }, [range, search, focusDayKey]);

  const prevRange = useRef(range);
  useEffect(() => {
    if (prevRange.current === range) return;
    prevRange.current = range;
    setFocusDayKeyState(todayKey);
  }, [range, todayKey]);

  return {
    range,
    setRange,
    search,
    setSearch,
    focusDayKey,
    setFocusDayKey,
    todayKey,
  };
}
