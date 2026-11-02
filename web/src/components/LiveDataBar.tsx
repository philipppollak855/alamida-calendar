import { useSterbefaelle } from '../hooks/useSterbefaelle';
import { LiveIndicator } from './LiveIndicator';

/** Gemeinsame Live-Leiste für Board und Wandmonitor. */
export function LiveDataBar({ compact = false }: { compact?: boolean }) {
  const { items, lastSyncAt, isLive, loading, error } = useSterbefaelle();
  const aktiv = items.filter((s) => s.aktivInAlamida).length;

  return (
    <div className={`live-data-bar ${compact ? 'compact' : ''}`}>
      <LiveIndicator isLive={isLive} lastSyncAt={lastSyncAt} loading={loading} />
      {!compact && (
        <span className="live-meta muted">
          Echtzeit · Agent-Updates ohne Reload
        </span>
      )}
      {isLive && (
        <span className="live-meta small">
          {items.length > 0
            ? `${items.length} Fälle${aktiv > 0 ? ` · ${aktiv} aktiv in Alamida` : ''}`
            : 'Verbunden — warte auf Agent-Sync'}
        </span>
      )}
      {error && <span className="live-error small">{error}</span>}
    </div>
  );
}
