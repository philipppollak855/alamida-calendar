import { onIdTokenChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { auth } from '../firebase';
import { ensureFreshIdToken } from './sessionRefresh';

const REFRESH_INTERVAL_MS = 45 * 60 * 1000;
const REFRESH_INTERVAL_HIDDEN_MS = 10 * 60 * 1000;

/** Hält die Firebase-Sitzung bei langem Tab/PWA-Betrieb aktiv. */
export function useSessionKeepAlive(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !auth) return;

    const refresh = () => {
      void ensureFreshIdToken(true);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    document.addEventListener('visibilitychange', onVisible);

    let intervalId = 0;
    const armInterval = () => {
      window.clearInterval(intervalId);
      const ms =
        document.visibilityState === 'hidden'
          ? REFRESH_INTERVAL_HIDDEN_MS
          : REFRESH_INTERVAL_MS;
      intervalId = window.setInterval(refresh, ms);
    };
    armInterval();
    document.addEventListener('visibilitychange', armInterval);
    const unsubToken = onIdTokenChanged(auth, () => {
      /* Listener hält Auth-Interna aktiv; Refresh bei Sichtbarkeit/Intervall. */
    });

    refresh();

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('visibilitychange', armInterval);
      window.clearInterval(intervalId);
      unsubToken();
    };
  }, [enabled]);
}
