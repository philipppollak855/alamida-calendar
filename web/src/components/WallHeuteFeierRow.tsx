import type { WallCalendarEntry } from '../board/wallCalendar';
import { WallCalBestattungsBadge } from './WallCalBestattungsBadge';

export function WallHeuteFeierRow({ entry }: { entry: WallCalendarEntry }) {
  const detail =
    entry.subtitle ||
    (entry.badges.length > 1 ? entry.badges.join(' · ') : entry.badges[0] !== entry.title ? entry.badges[0] : '');

  return (
    <article className="wall-big-row wall-big-row--feier">
      <time>{entry.timeLabel}</time>
      <div className="wall-big-main">
        <div className="wall-big-name-row">
          {entry.bestattungsMarker ? (
            <WallCalBestattungsBadge marker={entry.bestattungsMarker} />
          ) : null}
          <span className="wall-big-name">{entry.name}</span>
        </div>
        <span className="wall-big-meta">
          <strong className="wall-heute-feier-title">{entry.title}</strong>
          {detail ? ` · ${detail}` : ''}
        </span>
      </div>
    </article>
  );
}
