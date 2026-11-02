import { useMemo } from 'react';
import type { Sterbefall } from '../types';
import {
  buildKuehlraumTerminMarkers,
  type KuehlraumTerminMarkerKind,
} from '../board/kuehlraumTerminMarker';

const KIND_SHORT: Record<KuehlraumTerminMarkerKind, string> = {
  kremation: 'Krem.',
  beisetzung: 'Beis.',
  trauerfeier: 'TF',
  verabschiedung: 'Verab.',
};
import { WallCalBestattungsBadge } from './WallCalBestattungsBadge';

interface Props {
  fall: Sterbefall;
  now?: Date;
  className?: string;
  /** Kompakt für Kühlraum-Platzkarten — kurze Labels, kein Überlauf. */
  compact?: boolean;
  maxVisible?: number;
}

export function KuehlraumTerminMarker({
  fall,
  now,
  className,
  compact = false,
  maxVisible,
}: Props) {
  const markers = useMemo(
    () => buildKuehlraumTerminMarkers(fall, now ?? new Date()),
    [fall, now]
  );

  if (markers.length === 0) return null;

  const limit = maxVisible ?? (compact ? 1 : markers.length);
  const visible = markers.slice(0, limit);
  const hidden = markers.length - visible.length;

  return (
    <span
      className={[
        'cool-termin-markers',
        compact ? 'cool-termin-markers--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {visible.map((marker) => {
        const short =
          compact && marker.relativeLabel
            ? `${KIND_SHORT[marker.kind]} ${marker.relativeLabel}`
            : marker.label;
        return (
          <span
            key={`${marker.kind}-${marker.datum || marker.label}`}
            className={`cool-termin-marker cool-termin-marker--${marker.kind}`}
            title={marker.label}
          >
            {marker.bestattungsMarker ? (
              <WallCalBestattungsBadge marker={marker.bestattungsMarker} />
            ) : null}
            <span className="cool-termin-marker-text">{short}</span>
          </span>
        );
      })}
      {hidden > 0 && (
        <span className="cool-termin-more" title={markers.slice(limit).map((m) => m.label).join('\n')}>
          +{hidden}
        </span>
      )}
    </span>
  );
}
