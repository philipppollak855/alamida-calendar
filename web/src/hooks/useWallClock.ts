import { useEffect, useState } from 'react';

/** Uhr für Wand/PWA — bei Tab-Rückkehr sofort aktualisieren (Timer im Hintergrund gedrosselt). */
export function useWallClock(tickMs = 1000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const sync = () => setNow(new Date());
    let intervalId = 0;

    const armInterval = () => {
      window.clearInterval(intervalId);
      const ms = document.visibilityState === 'hidden' ? Math.max(tickMs, 1_000) : tickMs;
      intervalId = window.setInterval(sync, ms);
    };

    sync();
    armInterval();

    const onResume = () => {
      armInterval();
      sync();
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [tickMs]);

  return now;
}
