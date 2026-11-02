import type { BestattungsMarker } from '../board/feierterminLogic';

const TITLES: Record<BestattungsMarker, string> = {
  S: 'Sargbestattung (ohne Kremation)',
  U: 'Urne – Kremation vor Trauerfeier/Beisetzung',
};

export function WallCalBestattungsBadge({ marker }: { marker: BestattungsMarker }) {
  return (
    <span
      className={`wall-cal-bestattungs-marker wall-cal-bestattungs-marker--${marker}`}
      title={TITLES[marker]}
      aria-label={TITLES[marker]}
    >
      {marker}
    </span>
  );
}
