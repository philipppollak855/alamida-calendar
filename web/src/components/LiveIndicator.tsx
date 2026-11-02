import { useEffect, useState } from 'react';

function formatZeit(d: Date) {
  return d.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function LiveIndicator({
  isLive,
  lastSyncAt,
  loading,
  label = 'Live',
  hideSyncAge = false,
}: {
  isLive: boolean;
  lastSyncAt: Date | null;
  loading?: boolean;
  label?: string;
  /** Kein Sekunden-Zähler seit letztem Sync (z. B. Wandmonitor). */
  hideSyncAge?: boolean;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return <span className="live-indicator live-loading">Verbinde…</span>;
  }

  if (!isLive || !lastSyncAt) {
    return <span className="live-indicator live-offline">Keine Live-Verbindung</span>;
  }

  const sekunden = Math.floor((Date.now() - lastSyncAt.getTime()) / 1000);
  const showAge = !hideSyncAge && sekunden > 3;

  return (
    <span className="live-indicator live-on" title="Firestore Echtzeit-Listener aktiv">
      <span className="live-dot" aria-hidden />
      {label} · {formatZeit(lastSyncAt)}
      {showAge && <span className="live-warn"> ({sekunden}s)</span>}
    </span>
  );
}
