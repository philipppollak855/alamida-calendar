import { useEffect } from 'react';

/** Verhindert Display-Sleep auf Wandgeräten (wirkt nicht bei verstecktem Cast-Tab). */
export function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        lock?.release().catch(() => {});
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => {
          if (!cancelled && document.visibilityState === 'visible') void acquire();
        });
      } catch {
        /* nicht unterstützt oder verweigert */
      }
    };

    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      lock?.release().catch(() => {});
    };
  }, [enabled]);
}
