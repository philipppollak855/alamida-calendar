import { useMemo } from 'react';
import { buildMonthOverviewGrid, type WallCalendarDay } from '../board/wallCalendar';
import { dayOfMonthFromDayKey } from '../board/dateUtils';

interface Props {
  monthDays: WallCalendarDay[];
  anchor: Date;
  todayKey: string;
  selectedDayKey?: string | null;
  onDaySelect?: (dayKey: string) => void;
}

/** Monatsübersicht: Wochentage Mo–So, darunter Kalenderraster nur mit Tageszahl. */
export function WallCalendarMonthOverview({
  monthDays,
  anchor,
  todayKey,
  selectedDayKey,
  onDaySelect,
}: Props) {
  const grid = useMemo(
    () => buildMonthOverviewGrid(monthDays, anchor, todayKey),
    [monthDays, anchor, todayKey]
  );
  const interactive = Boolean(onDaySelect);

  return (
    <div
      className="wall-cal-period-overview wall-cal-period-overview--month-grid wall-cal-period-overview--even wall-cal-period-overview--dense-month wall-cal-period-overview--interactive"
      aria-label="Monatsübersicht"
    >
      {grid.weekdayLabels.map((wd) => (
        <span key={wd} className="wall-cal-period-weekday" aria-hidden>
          {wd}
        </span>
      ))}
      {grid.cells.map((day, index) => {
        if (!day) {
          return (
            <span
              key={`pad-${index}`}
              className="wall-cal-period-cell is-pad"
              aria-hidden
            />
          );
        }

        const dayNum = String(dayOfMonthFromDayKey(day.dayKey));
        const cellClass = [
          'wall-cal-period-cell',
          day.isToday ? 'is-today' : '',
          day.isWeekend ? 'is-weekend' : '',
          day.entries.length > 0 ? 'has-events' : '',
          selectedDayKey === day.dayKey ? 'is-selected' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const title =
          day.entries.length > 0
            ? `${day.dayLabel}: ${day.entries.length} Termine`
            : day.dayLabel;

        if (interactive) {
          return (
            <button
              key={day.dayKey}
              type="button"
              className={cellClass}
              title={title}
              aria-label={`${day.weekdayShort} ${dayNum}.${anchor.getMonth() + 1}.${
                anchor.getFullYear()
              }${day.entries.length > 0 ? `, ${day.entries.length} Termine` : ''}`}
              aria-pressed={selectedDayKey === day.dayKey}
              onClick={() => onDaySelect!(day.dayKey)}
            >
              <span className="wall-cal-period-num">{dayNum}</span>
              {day.entries.length > 0 && (
                <span className="wall-cal-period-badge">{day.entries.length}</span>
              )}
            </button>
          );
        }

        return (
          <div key={day.dayKey} className={cellClass} title={title}>
            <span className="wall-cal-period-num">{dayNum}</span>
            {day.entries.length > 0 && (
              <span className="wall-cal-period-badge">{day.entries.length}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
