import { useEffect, useRef } from 'react';

export type BackgroundKeepAliveOptions = {
  /** Polling im Hintergrund (Cast/Streaming, Tab nicht sichtbar). */
  hiddenIntervalMs?: number;
  /** Sicherheits-Polling im Vordergrund. */
  visibleIntervalMs?: number;
  /** Bei Sichtbarkeit sofort synchronisieren. */
  syncOnVisible?: boolean;
};

const DEFAULT_OPTIONS: Required<BackgroundKeepAliveOptions> = {
  hiddenIntervalMs: 15_000,
  visibleIntervalMs: 90_000,
  syncOnVisible: true,
};

/**
 * Periodisches Aufwecken auch im Hintergrund — Browser drosseln Timer, aber
 * Cast/Streaming bleibt so aktuell wie der Browser es zulässt.
 */
export function useBackgroundKeepAlive(
  enabled: boolean,
  onTick: () => void,
  options?: BackgroundKeepAliveOptions
) {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const optsRef = useRef({ ...DEFAULT_OPTIONS, ...options });
  optsRef.current = { ...DEFAULT_OPTIONS, ...options };

  useEffect(() => {
    if (!enabled) return;

    let intervalId = 0;

    const tick = () => onTickRef.current();

    const armInterval = () => {
      window.clearInterval(intervalId);
      const ms =
        document.visibilityState === 'hidden'
          ? optsRef.current.hiddenIntervalMs
          : optsRef.current.visibleIntervalMs;
      intervalId = window.setInterval(tick, ms);
    };

    const onVisibility = () => {
      armInterval();
      if (document.visibilityState === 'visible') {
        if (optsRef.current.syncOnVisible) tick();
      } else {
        tick();
      }
    };

    tick();
    armInterval();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener('pageshow', onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('pageshow', onVisibility);
    };
  }, [enabled]);
}

/** @deprecated Nutze {@link useBackgroundKeepAlive}. */
export const useFirestoreResume = useBackgroundKeepAlive;
