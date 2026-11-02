import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Sterbefall } from '../types';

import { useNarrowViewport } from '../hooks/useNarrowViewport';

import { useCalendarArtFilter } from '../hooks/useCalendarArtFilter';
import { useWallCalendarViewState } from '../hooks/useWallCalendarViewState';

import {

  ALL_CALENDAR_TERMIN_ARTEN,

  buildWallCalendarDays,
  buildWallCalendarDaysForAnchorMonth,
  buildWallCalendarDaysInRange,
  filterEntriesForAnchorMonth,
  filterEntriesInDayRange,

  buildWallCalendarEntries,

  CALENDAR_TERMIN_ART_LABELS,

  countCalendarEntries,
  summarizeWallCalendarDay,

  filterCalendarEntries,

  filterEntriesByArts,

  isCalendarFilterComplete,

  type WallCalendarDay,

  type WallCalendarRange,

} from '../board/wallCalendar';
import {
  currentWeekDayRange,
  daysPrependedBackward,
  expandMonthWindowBackward,
  expandMonthWindowForward,
  type WallCalendarDayRange,
} from '../board/monthScrollWindow';
import { dayOfMonthFromDayKey } from '../board/dateUtils';
import {
  calendarDayLayout,
  calendarEventFlexClass,
  monthGridScrollTop,
} from '../board/wallCalendarLayout';

import { WallCalendarDayDialog } from './WallCalendarDayDialog';
import { WallCalendarEventCard } from './WallCalendarEventCard';
import { WallCalendarMonthOverview } from './WallCalendarMonthOverview';
import { WallCalendarPeriodOverview } from './WallCalendarPeriodOverview';



interface Props {

  sterbefaelle: Sterbefall[];

  now: Date;

}



const RANGE_OPTIONS: { id: WallCalendarRange; label: string; short: string }[] = [

  { id: 7, label: '7 Tage', short: '7' },

  { id: 14, label: '14 Tage', short: '14' },

  { id: 'month', label: 'Monat', short: 'M' },

];

/** Desktop Monats-Einträge: eine Kalenderwoche (Mo–So) pro Zeile. */
const MONTH_GRID_COLUMNS_DESKTOP = 7;
const MONTH_GRID_GAP_PX = 8;
const MONTH_OVERSCAN_ROWS = 2;
const DEFAULT_MONTH_ROW_HEIGHT = 220;
const MONTH_SCROLL_CHUNK_WEEKS = 2;
const MONTH_SCROLL_EDGE_PX = 80;
const MONTH_EXPAND_COOLDOWN_MS = 400;

function monthEntryGridColumns(gridWidth: number, isNarrow: boolean): number {
  if (!isNarrow) return MONTH_GRID_COLUMNS_DESKTOP;
  return gridWidth >= 400 ? 3 : 2;
}



export function WallCalendarPanel({ sterbefaelle, now }: Props) {

  const isNarrow = useNarrowViewport();

  const { range, setRange, search, setSearch, focusDayKey, setFocusDayKey, todayKey } =
    useWallCalendarViewState(now);

  const { activeArts, toggle, selectAll, isActive } = useCalendarArtFilter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dialogDayKey, setDialogDayKey] = useState<string | null>(null);
  const scrollToFocusPending = useRef(false);
  const monthHasUserScrolled = useRef(false);
  const monthExpandLock = useRef(false);
  const monthExpandCooldownUntil = useRef(0);
  const monthLastScrollTop = useRef(0);
  const monthPendingScrollAdjustPx = useRef(0);
  const monthGridRef = useRef<HTMLDivElement | null>(null);
  const [monthScrollWindow, setMonthScrollWindow] = useState<WallCalendarDayRange>(() =>
    currentWeekDayRange(now)
  );
  const monthScrollWindowRef = useRef(monthScrollWindow);
  monthScrollWindowRef.current = monthScrollWindow;
  const monthTouchStartY = useRef<number | null>(null);
  const [monthGridMetrics, setMonthGridMetrics] = useState({
    columns: MONTH_GRID_COLUMNS_DESKTOP,
    rowHeight: DEFAULT_MONTH_ROW_HEIGHT,
    scrollTop: 0,
    viewportHeight: 0,
  });
  const monthGridMetricsRef = useRef(monthGridMetrics);
  monthGridMetricsRef.current = monthGridMetrics;

  const selectFocusDay = useCallback(
    (dayKey: string) => {
      scrollToFocusPending.current = true;
      setFocusDayKey(dayKey);
    },
    [setFocusDayKey]
  );

  const openDayDialog = useCallback(
    (dayKey: string) => {
      setDialogDayKey(dayKey);
      setFocusDayKey(dayKey);
    },
    [setFocusDayKey]
  );

  const handleDaySelect = useCallback(
    (dayKey: string) => {
      if (range === 'month') {
        openDayDialog(dayKey);
        return;
      }
      selectFocusDay(dayKey);
    },
    [range, openDayDialog, selectFocusDay]
  );

  const changeRange = useCallback(
    (next: WallCalendarRange) => {
      // Beim Umschalten (z. B. auf Monat) den Fokus aktiv auf heute setzen
      // und Scroll in der Eintragsansicht erzwingen.
      scrollToFocusPending.current = true;
      setFocusDayKey(todayKey);
      setRange(next);
    },
    [setFocusDayKey, setRange, todayKey]
  );

  const allEntries = useMemo(() => buildWallCalendarEntries(sterbefaelle), [sterbefaelle]);

  const scoped = useMemo(() => {
    let list = allEntries;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.searchText.includes(q));
    return filterEntriesByArts(list, activeArts);
  }, [allEntries, search, activeArts]);

  const filtered = useMemo(() => {
    if (range === 'month') {
      const inMonth = filterEntriesForAnchorMonth(scoped, now);
      return filterEntriesInDayRange(
        inMonth,
        monthScrollWindow.fromKey,
        monthScrollWindow.toKey
      );
    }
    return filterCalendarEntries(scoped, range, now, '');
  }, [scoped, range, now, monthScrollWindow]);

  const days = useMemo(() => {
    if (range === 'month') {
      return buildWallCalendarDaysInRange(
        filtered,
        now,
        monthScrollWindow.fromKey,
        monthScrollWindow.toKey
      );
    }
    return buildWallCalendarDays(filtered, range, now);
  }, [filtered, range, now, monthScrollWindow]);

  const overviewDays = useMemo(() => {
    if (range === 'month') {
      return buildWallCalendarDaysForAnchorMonth(filterEntriesForAnchorMonth(scoped, now), now);
    }
    return days;
  }, [range, scoped, now, days]);

  const dialogDay = useMemo(
    () => (dialogDayKey ? (days.find((d) => d.dayKey === dialogDayKey) ?? null) : null),
    [dialogDayKey, days]
  );

  const monthSummaryOnly = isNarrow && range === 'month';

  const totalInRange = useMemo(() => {
    if (range === 'month') return filterEntriesForAnchorMonth(scoped, now).length;
    return filtered.length;
  }, [range, scoped, now, filtered.length]);

  const monthLabel =

    range === 'month'

      ? now.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })

      : range === 14

        ? '14 Tage'

        : '7 Tage';



  const showPeriodOverview = range === 'month' || range === 7 || range === 14;

  const overviewColumns = range === 14 ? 7 : 7;

  /** Monat: vertikales Raster wie Desktop; 7/14 Tage: horizontale Agenda. */
  const mobileUsesAgenda = isNarrow && range !== 'month';

  useEffect(() => {
    // Beim Öffnen des Kalender-Tabs immer auf "heute" fokussieren.
    scrollToFocusPending.current = true;
    setFocusDayKey(todayKey);
  }, [todayKey, setFocusDayKey]);

  useEffect(() => {
    if (!scrollToFocusPending.current || !focusDayKey || activeArts.size === 0) return;
    // Monatsraster: eigenes vertikales Scrollen (virtuelles Raster, kein scrollIntoView).
    if (range === 'month') return;
    const el = document.getElementById(`wall-cal-focus-${focusDayKey}`);
    if (!el) return;

    scrollToFocusPending.current = false;
    const t = window.setTimeout(() => {
      el.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: isNarrow ? 'start' : 'nearest',
      });
    }, 60);
    return () => window.clearTimeout(t);
  }, [focusDayKey, days.length, isNarrow, activeArts.size, range]);

  const syncMonthGridMetrics = useCallback(() => {
    const grid = monthGridRef.current;
    if (!grid || range !== 'month') return;
    const columns = monthEntryGridColumns(grid.clientWidth, isNarrow);
    const firstDay = grid.querySelector('.wall-cal-day--month') as HTMLElement | null;
    const rowHeight =
      (firstDay?.getBoundingClientRect().height ?? DEFAULT_MONTH_ROW_HEIGHT) + MONTH_GRID_GAP_PX;

    setMonthGridMetrics((prev) => ({
      columns,
      rowHeight: Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : prev.rowHeight,
      scrollTop: grid.scrollTop,
      viewportHeight: grid.clientHeight,
    }));
  }, [range, isNarrow]);

  const canExpandMonthWindow = useCallback(() => {
    return !monthExpandLock.current && Date.now() >= monthExpandCooldownUntil.current;
  }, []);

  const tryExpandMonthWindow = useCallback(
    (direction: 'backward' | 'forward'): boolean => {
      const grid = monthGridRef.current;
      if (!grid || range !== 'month' || !canExpandMonthWindow()) return false;

      monthHasUserScrolled.current = true;
      monthExpandLock.current = true;
      monthExpandCooldownUntil.current = Date.now() + MONTH_EXPAND_COOLDOWN_MS;

      const columns = monthEntryGridColumns(grid.clientWidth, isNarrow);
      const rowHeight = monthGridMetricsRef.current.rowHeight;

      if (direction === 'backward') {
        const prev = monthScrollWindowRef.current;
        const next = expandMonthWindowBackward(prev, MONTH_SCROLL_CHUNK_WEEKS);
        const added = daysPrependedBackward(prev, next);
        const rows = Math.ceil(added / Math.max(1, columns));
        monthPendingScrollAdjustPx.current += rows * rowHeight;
        setMonthScrollWindow(next);
        return true;
      }

      setMonthScrollWindow((w) => expandMonthWindowForward(w, MONTH_SCROLL_CHUNK_WEEKS));
      return true;
    },
    [range, isNarrow, canExpandMonthWindow]
  );

  const handleMonthGridScroll = useCallback(() => {
    const grid = monthGridRef.current;
    if (!grid || range !== 'month') return;

    const scrollTop = grid.scrollTop;
    const prevScrollTop = monthLastScrollTop.current;
    const scrollDelta = scrollTop - prevScrollTop;
    monthLastScrollTop.current = scrollTop;

    const scrollHeight = grid.scrollHeight;
    const clientHeight = grid.clientHeight;
    const scrollable = scrollHeight > clientHeight + 2;

    setMonthGridMetrics((prev) => ({
      ...prev,
      columns: monthEntryGridColumns(grid.clientWidth, isNarrow),
      scrollTop,
      viewportHeight: clientHeight,
    }));

    if (!scrollable) return;

    if (!monthHasUserScrolled.current) {
      if (scrollTop > 8) monthHasUserScrolled.current = true;
      else return;
    }

    if (!canExpandMonthWindow()) return;

    const atTop = scrollTop < MONTH_SCROLL_EDGE_PX;
    const atBottom = scrollHeight - scrollTop - clientHeight < MONTH_SCROLL_EDGE_PX;
    if (atTop && scrollDelta < -1) tryExpandMonthWindow('backward');
    else if (atBottom && scrollDelta > 1) tryExpandMonthWindow('forward');
  }, [range, isNarrow, tryExpandMonthWindow, canExpandMonthWindow]);

  useEffect(() => {
    if (range !== 'month') return;
    const grid = monthGridRef.current;
    if (!grid) return;

    const onWheel = (e: WheelEvent) => {
      const { scrollHeight, clientHeight } = grid;
      const scrollable = scrollHeight > clientHeight + 2;
      if (scrollable) return;

      if (e.deltaY < 0) {
        if (tryExpandMonthWindow('backward')) e.preventDefault();
      } else if (e.deltaY > 0) {
        if (tryExpandMonthWindow('forward')) e.preventDefault();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      monthTouchStartY.current = e.touches[0]?.clientY ?? null;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const startY = monthTouchStartY.current;
      const endY = e.changedTouches[0]?.clientY;
      monthTouchStartY.current = null;
      if (startY == null || endY == null) return;

      const dy = endY - startY;
      if (Math.abs(dy) < 28) return;

      const { scrollTop, scrollHeight, clientHeight } = grid;
      const scrollable = scrollHeight > clientHeight + 2;
      const atTop = scrollTop < MONTH_SCROLL_EDGE_PX;
      const atBottom =
        scrollable && scrollHeight - scrollTop - clientHeight < MONTH_SCROLL_EDGE_PX;

      if (dy > 0 && atTop) tryExpandMonthWindow('backward');
      else if (dy < 0 && (!scrollable || atBottom)) tryExpandMonthWindow('forward');
    };

    monthLastScrollTop.current = grid.scrollTop;
    syncMonthGridMetrics();
    const ro = new ResizeObserver(syncMonthGridMetrics);
    ro.observe(grid);
    grid.addEventListener('scroll', handleMonthGridScroll, { passive: true });
    grid.addEventListener('wheel', onWheel, { passive: false });
    grid.addEventListener('touchstart', onTouchStart, { passive: true });
    grid.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      grid.removeEventListener('scroll', handleMonthGridScroll);
      grid.removeEventListener('wheel', onWheel);
      grid.removeEventListener('touchstart', onTouchStart);
      grid.removeEventListener('touchend', onTouchEnd);
      ro.disconnect();
    };
  }, [range, days.length, isNarrow, handleMonthGridScroll, syncMonthGridMetrics, tryExpandMonthWindow]);

  const scrollMonthGridToFocus = useCallback(() => {
    const grid = monthGridRef.current;
    if (!grid || range !== 'month' || !focusDayKey) return false;

    const viewportHeight = grid.clientHeight;
    if (viewportHeight <= 0) return false;

    const firstDay = grid.querySelector('.wall-cal-day--month') as HTMLElement | null;
    const rowHeight =
      (firstDay?.getBoundingClientRect().height ?? monthGridMetrics.rowHeight) + MONTH_GRID_GAP_PX;
    if (rowHeight <= 0) return false;

    const index = days.findIndex((d) => d.dayKey === focusDayKey);
    const top = monthGridScrollTop(index, monthGridMetrics.columns, rowHeight, viewportHeight);
    if (top === null) return false;

    grid.scrollTop = top;
    monthLastScrollTop.current = grid.scrollTop;
    return Math.abs(grid.scrollTop - top) <= 8;
  }, [range, focusDayKey, days, monthGridMetrics.rowHeight, monthGridMetrics.columns]);

  useEffect(() => {
    if (!scrollToFocusPending.current || range !== 'month' || !focusDayKey) return;
    if (activeArts.size === 0 || totalInRange === 0) return;

    let cancelled = false;
    const attempt = () => {
      if (cancelled || !scrollToFocusPending.current) return;
      if (scrollMonthGridToFocus()) {
        scrollToFocusPending.current = false;
      }
    };

    attempt();
    const raf1 = requestAnimationFrame(attempt);
    const t1 = window.setTimeout(attempt, 60);
    const t2 = window.setTimeout(attempt, 250);

    const grid = monthGridRef.current;
    const ro =
      grid &&
      new ResizeObserver(() => {
        attempt();
      });
    if (grid && ro) ro.observe(grid);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
    };
  }, [
    range,
    focusDayKey,
    days.length,
    activeArts.size,
    totalInRange,
    scrollMonthGridToFocus,
    monthGridMetrics.viewportHeight,
  ]);

  useEffect(() => {
    if (range !== 'month') return;
    setMonthScrollWindow(currentWeekDayRange(now));
    monthHasUserScrolled.current = false;
    monthPendingScrollAdjustPx.current = 0;
    monthExpandCooldownUntil.current = 0;
    monthExpandLock.current = false;
    scrollToFocusPending.current = true;
    setFocusDayKey(todayKey);
  }, [range, todayKey, setFocusDayKey, now]);

  useEffect(() => {
    if (range !== 'month') setDialogDayKey(null);
  }, [range]);

  useLayoutEffect(() => {
    if (range !== 'month') return;

    const grid = monthGridRef.current;
    if (monthPendingScrollAdjustPx.current > 0 && grid) {
      grid.scrollTop += monthPendingScrollAdjustPx.current;
      monthPendingScrollAdjustPx.current = 0;
      monthLastScrollTop.current = grid.scrollTop;
      setMonthGridMetrics((prev) => ({
        ...prev,
        scrollTop: grid.scrollTop,
        viewportHeight: grid.clientHeight,
      }));
    }

    monthExpandLock.current = false;
  }, [range, days.length, monthScrollWindow.fromKey, monthScrollWindow.toKey]);

  useLayoutEffect(() => {
    if (range !== 'month' || !focusDayKey || !scrollToFocusPending.current) return;
    const index = days.findIndex((d) => d.dayKey === focusDayKey);
    if (index < 0) return;

    const grid = monthGridRef.current;
    const columns = Math.max(1, monthGridMetrics.columns);
    const rowHeight = Math.max(1, monthGridMetrics.rowHeight);
    const viewportHeight = grid?.clientHeight ?? monthGridMetrics.viewportHeight;
    if (viewportHeight <= 0) return;

    const top = monthGridScrollTop(index, columns, rowHeight, viewportHeight);
    if (top === null) return;

    setMonthGridMetrics((prev) =>
      Math.abs(prev.scrollTop - top) < 2 ? prev : { ...prev, scrollTop: top }
    );
    if (grid) {
      grid.scrollTop = top;
      monthLastScrollTop.current = top;
    }
  }, [range, days, focusDayKey, monthGridMetrics.columns, monthGridMetrics.rowHeight, monthGridMetrics.viewportHeight]);

  const monthVirtual = useMemo(() => {
    if (range !== 'month') {
      return { visibleDays: days, topSpacerPx: 0, bottomSpacerPx: 0 };
    }
    const rowHeight = Math.max(1, monthGridMetrics.rowHeight);
    const viewportHeight = Math.max(rowHeight, monthGridMetrics.viewportHeight);
    const columns = Math.max(1, monthGridMetrics.columns);
    const totalRows = Math.max(1, Math.ceil(days.length / columns));
    const startRow = Math.max(
      0,
      Math.floor(monthGridMetrics.scrollTop / rowHeight) - MONTH_OVERSCAN_ROWS
    );
    const endRow = Math.min(
      totalRows - 1,
      Math.ceil((monthGridMetrics.scrollTop + viewportHeight) / rowHeight) + MONTH_OVERSCAN_ROWS
    );
    const startIndex = startRow * columns;
    const endIndex = Math.min(days.length, (endRow + 1) * columns);
    const topSpacerPx = startRow * rowHeight;
    const bottomSpacerPx = Math.max(0, (totalRows - endRow - 1) * rowHeight);

    return {
      visibleDays: days.slice(startIndex, endIndex),
      topSpacerPx,
      bottomSpacerPx,
    };
  }, [range, days, monthGridMetrics]);



  const filterAllOn = isCalendarFilterComplete(activeArts);

  const onToday = todayKey;
  const focusIsToday = focusDayKey === onToday;



  return (

    <div
      className={`wall-cal ${isNarrow ? 'wall-cal--narrow' : ''} ${isNarrow && range === 'month' ? 'wall-cal--mobile-month' : ''}`}
    >

      <div className="wall-cal-toolbar">

        <div className="wall-cal-toolbar-left">

          {!isNarrow && <h2 className="wall-stage-title wall-cal-title">Kalender</h2>}

          {(range === 'month' || isNarrow) && (

            <span className="wall-cal-month">{monthLabel}</span>

          )}

          <span className="wall-cal-count">

            {totalInRange} Termin{totalInRange === 1 ? '' : 'e'}

          </span>

        </div>

        <div className="wall-cal-toolbar-right">

          <label className="wall-cal-search">

            <span className="sr-only">Suche</span>

            <input

              type="search"

              className="wall-cal-search-input"

              placeholder={isNarrow ? 'Suche…' : 'Suche Name, Ort, Sterbefall-ID, Überführung …'}

              value={search}

              onChange={(e) => setSearch(e.target.value)}

              autoComplete="off"

            />

          </label>

          <div className="wall-cal-range" role="group" aria-label="Zeitraum">

            {RANGE_OPTIONS.map((opt) => (

              <button

                key={String(opt.id)}

                type="button"

                className={`wall-cal-range-btn ${range === opt.id ? 'active' : ''}`}

                onClick={() => changeRange(opt.id)}

              >

                {isNarrow ? opt.short : opt.label}

              </button>

            ))}

          </div>

        </div>

      </div>



      {isNarrow && (
        <button
          type="button"
          className="wall-cal-filters-toggle"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((o) => !o)}
        >
          Filter ({activeArts.size}/{ALL_CALENDAR_TERMIN_ARTEN.length})
          <span className="wall-cal-filters-chevron" aria-hidden>
            {filtersOpen ? '▲' : '▼'}
          </span>
        </button>
      )}

      <div
        className={`wall-cal-art-filters ${isNarrow && !filtersOpen ? 'is-collapsed' : ''}`}
        role="group"
        aria-label="Terminarten filtern"
      >
        {!filterAllOn && (
          <button type="button" className="wall-cal-art-all" onClick={selectAll}>
            Alle
          </button>
        )}
        {ALL_CALENDAR_TERMIN_ARTEN.map((art) => (
          <button
            key={art}
            type="button"
            className={`wall-cal-art-chip wall-cal-art-chip--${art} ${isActive(art) ? 'active' : ''}`}
            aria-pressed={isActive(art)}
            onClick={() => toggle(art)}
          >
            {CALENDAR_TERMIN_ART_LABELS[art]}
          </button>
        ))}
      </div>



      {activeArts.size === 0 ? (

        <p className="wall-empty wall-cal-empty">Mindestens eine Terminart auswählen</p>

      ) : totalInRange === 0 ? (

        <p className="wall-empty wall-cal-empty">

          {search.trim()

            ? 'Keine Termine zur Suche / Filter'

            : 'Keine Termine im Zeitraum'}

        </p>

      ) : mobileUsesAgenda ? (

        <div className="wall-cal-mobile-body">

          {showPeriodOverview && (
            <WallCalendarPeriodRow
              days={overviewDays}
              columns={overviewColumns}
              compact
              monthAnchor={range === 'month' ? now : undefined}
              todayKey={todayKey}
              selectedDayKey={focusDayKey}
              onDaySelect={handleDaySelect}
              onToday={() => selectFocusDay(onToday)}
              todayDisabled={focusIsToday}
            />
          )}

          <WallCalendarMobileAgenda
            days={days}
            range={range}
            scrollToDayKey={focusDayKey}
          />

        </div>

      ) : (

        <div className="wall-cal-desktop-body">

          {showPeriodOverview && (
            <WallCalendarPeriodRow
              days={overviewDays}
              columns={overviewColumns}
              compact={range !== 'month'}
              monthAnchor={range === 'month' ? now : undefined}
              todayKey={todayKey}
              selectedDayKey={focusDayKey}
              onDaySelect={handleDaySelect}
              onToday={() => selectFocusDay(onToday)}
              todayDisabled={focusIsToday}
            />
          )}

          {range === 'month' ? (

            <div className="wall-cal-month-grid" ref={monthGridRef}>

              {monthVirtual.topSpacerPx > 0 && (
                <div
                  className="wall-cal-month-spacer"
                  style={{ height: `${monthVirtual.topSpacerPx}px` }}
                  aria-hidden
                />
              )}

              {monthVirtual.visibleDays.map((day) => (

                <WallCalendarDaySection
                  key={day.dayKey}
                  day={day}
                  compact
                  scrollId={day.dayKey}
                  active={focusDayKey === day.dayKey}
                  onOpenDay={openDayDialog}
                  summaryOnly={monthSummaryOnly}
                />

              ))}

              {monthVirtual.bottomSpacerPx > 0 && (
                <div
                  className="wall-cal-month-spacer"
                  style={{ height: `${monthVirtual.bottomSpacerPx}px` }}
                  aria-hidden
                />
              )}

            </div>

          ) : range === 14 ? (

            <div className="wall-cal-weeks-stack">

              {[0, 1].map((weekIdx) => (

                <WallCalendarWeekStrip
                  key={weekIdx}
                  days={days.slice(weekIdx * 7, weekIdx * 7 + 7)}
                  focusDayKey={focusDayKey}
                  weeksStack
                />

              ))}

            </div>

          ) : (

            <WallCalendarWeekStrip days={days} focusDayKey={focusDayKey} />

          )}

        </div>

      )}

      {dialogDay && (
        <WallCalendarDayDialog
          day={dialogDay}
          mobile={isNarrow}
          onClose={() => setDialogDayKey(null)}
        />
      )}

    </div>

  );

}



function WallCalendarWeekStrip({
  days,
  focusDayKey,
  weeksStack = false,
}: {
  days: WallCalendarDay[];
  focusDayKey: string | null;
  weeksStack?: boolean;
}) {
  return (
    <div className={`wall-cal-strip wall-cal-strip--week${weeksStack ? ' wall-cal-strip--stacked' : ''}`}>
      {days.map((day) => (
        <WallCalendarDaySection
          key={day.dayKey}
          day={day}
          compact
          strip
          weeksStack={weeksStack}
          scrollId={day.dayKey}
          active={focusDayKey === day.dayKey}
        />
      ))}
    </div>
  );
}

function WallCalendarPeriodRow({
  days,
  columns,
  compact,
  monthAnchor,
  todayKey,
  selectedDayKey,
  onDaySelect,
  onToday,
  todayDisabled,
}: {
  days: WallCalendarDay[];
  columns: number;
  compact?: boolean;
  monthAnchor?: Date;
  todayKey: string;
  selectedDayKey?: string | null;
  onDaySelect: (dayKey: string) => void;
  onToday: () => void;
  todayDisabled: boolean;
}) {
  return (
    <div className="wall-cal-period-row">
      {monthAnchor ? (
        <WallCalendarMonthOverview
          monthDays={days}
          anchor={monthAnchor}
          todayKey={todayKey}
          selectedDayKey={selectedDayKey}
          onDaySelect={onDaySelect}
        />
      ) : (
        <WallCalendarPeriodOverview
          days={days}
          columns={columns}
          compact={compact}
          selectedDayKey={selectedDayKey}
          onDaySelect={onDaySelect}
        />
      )}
      <button
        type="button"
        className="wall-cal-today-btn"
        onClick={onToday}
        disabled={todayDisabled}
        aria-label="Zu heute springen"
      >
        Heute
      </button>
    </div>
  );
}

function WallCalendarMobileAgenda({
  days,
  range,
  scrollToDayKey,
}: {
  days: WallCalendarDay[];
  range: WallCalendarRange;
  scrollToDayKey?: string | null;
}) {
  return (
    <div
      className={`wall-cal-mobile-strip wall-cal-mobile-strip--${range}`}
      aria-label="Termine — seitlich wischen"
    >
      {days.map((day) => (
        <section
          key={day.dayKey}
          id={`wall-cal-focus-${day.dayKey}`}
          className={`wall-cal-agenda-day ${day.isToday ? 'is-today' : ''} ${day.isWeekend ? 'is-weekend' : ''} ${day.entries.length === 0 ? 'is-empty' : ''} ${scrollToDayKey === day.dayKey ? 'is-focused' : ''}`}
        >
          <header className="wall-cal-agenda-day-head">
            <span className="wall-cal-agenda-wd">{day.weekdayShort}</span>
            <span className="wall-cal-agenda-date">
              {day.dayLabel.split(',')[1]?.trim() ?? day.dayLabel}
            </span>
            {day.isToday && <span className="wall-cal-today-pill">Heute</span>}
            {day.entries.length > 0 && (
              <span className="wall-cal-agenda-count">{day.entries.length}</span>
            )}
          </header>
          {day.entries.length === 0 ? (
            <p className="wall-cal-agenda-none">—</p>
          ) : (
            <ul className="wall-cal-agenda-list">
              {day.entries.map((e) => (
                <li key={e.id} className={`wall-cal-event ${e.grouped ? 'is-grouped' : ''}`}>
                  <WallCalendarEventCard entry={e} mobile />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}



function WallCalendarDaySection({

  day,

  compact = false,

  strip = false,
  weeksStack = false,

  scrollId,
  active = false,
  onOpenDay,
  summaryOnly = false,

}: {

  day: WallCalendarDay;

  compact?: boolean;

  strip?: boolean;
  weeksStack?: boolean;

  scrollId?: string;
  active?: boolean;
  onOpenDay?: (dayKey: string) => void;
  summaryOnly?: boolean;

}) {
  const mod = strip ? 'strip' : compact ? 'month' : '';
  const isEmpty = day.entries.length === 0;
  const densityMode = weeksStack ? 'stripCompact' : strip ? 'strip' : 'month';
  const { densityScale, slotWeight } = calendarDayLayout(day.entries, densityMode);
  const densityStyle = { '--cal-density': densityScale } as React.CSSProperties;
  const denseThreshold = weeksStack ? 3 : 4;
  const summary = summarizeWallCalendarDay(day.entries);
  const clickable = Boolean(onOpenDay);

  const body = summaryOnly ? (
    <div className="wall-cal-day-summary">
      {summary.total === 0 ? (
        <span className="wall-cal-day-summary-none">—</span>
      ) : (
        <>
          <span className="wall-cal-day-summary-total">
            {summary.total} Termin{summary.total === 1 ? '' : 'e'}
          </span>
          {summary.ueberfuehrungen > 0 && (
            <span className="wall-cal-day-summary-ueb">
              {summary.ueberfuehrungen} Überf.
            </span>
          )}
        </>
      )}
    </div>
  ) : (
    <ul className="wall-cal-day-list" style={densityStyle}>
      {day.entries.length === 0 ? (
        <li className="wall-cal-day-none">—</li>
      ) : (
        day.entries.map((e) => (
          <li
            key={e.id}
            className={`wall-cal-event ${calendarEventFlexClass(e)} ${e.grouped ? 'is-grouped' : ''}`}
          >
            <WallCalendarEventCard entry={e} compact={compact || strip} strip={strip} />
          </li>
        ))
      )}
    </ul>
  );

  const className = [
    'wall-cal-day',
    mod ? `wall-cal-day--${mod}` : '',
    weeksStack ? 'is-strip-compact' : '',
    day.isToday ? 'is-today' : '',
    active ? 'is-active' : '',
    day.isWeekend ? 'is-weekend' : '',
    isEmpty ? 'is-empty' : 'has-events',
    slotWeight > denseThreshold ? 'is-dense' : '',
    clickable ? 'is-clickable' : '',
    summaryOnly ? 'is-summary-only' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const head = (
    <header className="wall-cal-day-head">
      <span className="wall-cal-day-wd">{day.weekdayShort}</span>
      <span className="wall-cal-day-num">
        {summaryOnly
          ? String(dayOfMonthFromDayKey(day.dayKey))
          : compact
            ? (day.dayLabel.split(',')[1]?.trim() ?? day.dayLabel)
            : day.dayLabel}
      </span>
      {day.isToday && (
        <span className={`wall-cal-today-pill ${summaryOnly ? 'wall-cal-today-pill--mini' : ''}`}>
          {summaryOnly ? '●' : 'Heute'}
        </span>
      )}
      {strip && day.entries.length > 0 && (
        <span className="wall-cal-day-badge">{day.entries.length}</span>
      )}
    </header>
  );

  if (!clickable) {
    return (
      <section
        id={scrollId ? `wall-cal-focus-${scrollId}` : undefined}
        className={className}
        style={strip || compact ? densityStyle : undefined}
      >
        {head}
        {body}
      </section>
    );
  }

  return (
    <section
      id={scrollId ? `wall-cal-focus-${scrollId}` : undefined}
      className={className}
      style={strip || compact ? densityStyle : undefined}
    >
      <button
        type="button"
        className="wall-cal-day-open"
        onClick={() => onOpenDay!(day.dayKey)}
        aria-label={`Termine am ${day.dayLabel}${summary.total > 0 ? `, ${summary.total} Termine` : ''}`}
      >
        {head}
        {body}
      </button>
    </section>
  );
}



export function wallCalendarTabCount(sterbefaelle: Sterbefall[], now: Date): number {

  const entries = buildWallCalendarEntries(sterbefaelle);

  return countCalendarEntries(filterCalendarEntries(entries, 7, now, ''));

}


