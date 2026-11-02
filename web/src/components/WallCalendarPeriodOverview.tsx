import type { WallCalendarDay } from '../board/wallCalendar';

interface Props {
  days: WallCalendarDay[];
  /** Spalten im Raster (7 für Woche / Monat) */
  columns?: number;
  compact?: boolean;
  /** Mobil-Monat: sehr flaches Raster */
  denseMonth?: boolean;
  selectedDayKey?: string | null;
  onDaySelect?: (dayKey: string) => void;
}

/** Kompakte Tagesübersicht mit Terminanzahl (Monat, 7/14 Tage). */
export function WallCalendarPeriodOverview({
  days,
  columns = 7,
  compact,
  denseMonth,
  selectedDayKey,
  onDaySelect,
}: Props) {
  const interactive = Boolean(onDaySelect);
  const evenCells = denseMonth || !compact;

  return (
    <div
      className={`wall-cal-period-overview ${compact ? 'wall-cal-period-overview--compact' : ''} ${denseMonth ? 'wall-cal-period-overview--dense-month' : ''} ${evenCells ? 'wall-cal-period-overview--even' : ''} ${interactive ? 'wall-cal-period-overview--interactive' : ''}`}
      style={{ '--cal-overview-cols': columns } as React.CSSProperties}
      aria-label="Zeitraumübersicht"
    >
      {days.map((day) => {
        const dayNum =
          day.dayLabel.split(',')[1]?.trim() ??
          day.dayLabel.replace(/^[^,]+,\s*/, '');
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
              aria-label={`${day.dayLabel}${day.entries.length > 0 ? `, ${day.entries.length} Termine` : ''}`}
              aria-pressed={selectedDayKey === day.dayKey}
              onClick={() => onDaySelect!(day.dayKey)}
            >
              {!compact && (
                <span className="wall-cal-period-wd">{day.weekdayShort}</span>
              )}
              <span className="wall-cal-period-num">{dayNum}</span>
              {day.entries.length > 0 && (
                <span className="wall-cal-period-badge">{day.entries.length}</span>
              )}
            </button>
          );
        }

        return (
          <div key={day.dayKey} className={cellClass} title={title}>
            {!compact && (
              <span className="wall-cal-period-wd">{day.weekdayShort}</span>
            )}
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
