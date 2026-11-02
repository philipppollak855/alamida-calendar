import { schrittTypLabel } from '../types';

export function SchrittBadge({
  typ,
  className = '',
}: {
  typ?: string;
  className?: string;
}) {
  const t = typ ?? 'ueberfuehrung';
  return (
    <span className={`chip chip-${t} ${className}`.trim()}>
      {schrittTypLabel(t)}
    </span>
  );
}

export function StatusChip({ status, highlight }: { status: string; highlight?: boolean }) {
  const label =
    status === 'abholung_noetig'
      ? 'Abholung nötig'
      : status === 'heute'
        ? 'Heute'
        : status === 'geplant'
          ? 'Geplant'
          : status;
  return (
    <span className={`chip chip-status status-${status} ${highlight ? 'chip-emphasis' : ''}`.trim()}>
      {label}
    </span>
  );
}

export function EndzielChip({ typ, ort }: { typ?: string; ort?: string }) {
  const label =
    typ === 'krematorium' ? 'Krematorium' : typ === 'beisetzung' ? 'Beisetzung' : 'Endziel';
  return (
    <span className="chip chip-endziel" title={ort}>
      {label}
      {ort && <span className="chip-sub">{ort}</span>}
    </span>
  );
}
