import {
  calendarColorGroupFromArts,
  type WallCalendarEntry,
} from '../board/wallCalendar';
import { WallCalBestattungsBadge } from './WallCalBestattungsBadge';

export function WallCalendarEventCard({
  entry,
  compact = false,
  strip = false,
  mobile = false,
}: {
  entry: WallCalendarEntry;
  compact?: boolean;
  strip?: boolean;
  mobile?: boolean;
}) {
  const colorClass = `wall-cal-card--color-${calendarColorGroupFromArts(entry.arts)}`;
  const bestattungsBadge = entry.bestattungsMarker ? (
    <WallCalBestattungsBadge marker={entry.bestattungsMarker} />
  ) : null;

  if (mobile) {
    return (
      <article
        className={`wall-cal-card wall-cal-card--mobile ${colorClass} ${entry.grouped ? 'is-grouped' : ''}`}
      >
        <div className="wall-cal-card-headline">
          {bestattungsBadge}
          <time className="wall-cal-time">{entry.timeLabel}</time>
        </div>
        <div className="wall-cal-mobile-body">
          <span className="wall-cal-name">{entry.name}</span>
          <span className="wall-cal-mobile-line">
            <span className="wall-cal-mobile-types">{entry.badges.join(' · ')}</span>
            {(entry.subtitle || entry.title) && (
              <span className="wall-cal-meta">{entry.subtitle || entry.title}</span>
            )}
          </span>
        </div>
      </article>
    );
  }

  if (strip) {
    const stripMeta = entry.subtitle || entry.title;
    const stripTypes = entry.badges.join(' · ');
    return (
      <article className={`wall-cal-card wall-cal-card--strip ${colorClass}`}>
        <div className="wall-cal-strip-top">
          {bestattungsBadge}
          <time className="wall-cal-time">{entry.timeLabel}</time>
          {stripTypes && <span className="wall-cal-strip-types">{stripTypes}</span>}
        </div>
        <span className="wall-cal-name">{entry.name}</span>
        {stripMeta ? <span className="wall-cal-strip-meta">{stripMeta}</span> : null}
      </article>
    );
  }

  return (
    <article className={`wall-cal-card ${compact ? 'wall-cal-card--compact' : ''} ${colorClass}`}>
      <div className="wall-cal-card-top">
        <div className="wall-cal-card-headline">
          {bestattungsBadge}
          <time className="wall-cal-time">{entry.timeLabel}</time>
        </div>
        <div className="wall-cal-badges">
          {entry.badges.map((b) => (
            <span key={b} className="wall-cal-badge">
              {b}
            </span>
          ))}
        </div>
      </div>
      <span className="wall-cal-name">{entry.name}</span>
      <span className="wall-cal-meta">{entry.subtitle || entry.title}</span>
      {!compact && entry.grouped && (
        <span className="wall-cal-group-hint">Trauerblock · {entry.sterbefallId}</span>
      )}
    </article>
  );
}
