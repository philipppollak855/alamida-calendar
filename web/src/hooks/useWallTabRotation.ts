import { useCallback, useEffect, useRef, useState } from 'react';
import type { WallTabWechselSekunden } from '../types/dispositionSettings';
import {
  wallRotationEpochForSlide,
  wallRotationPosition,
} from './wallTabRotationClock';

export type WallView = 'kuehlraum' | 'extern' | 'kalender' | 'abholungen' | 'offen';

export const WALL_VIEWS: WallView[] = ['kuehlraum', 'extern', 'kalender', 'abholungen', 'offen'];

const DEFAULT_SEC = 18;
const MIN_SEC = 5;
const MAX_SEC = 300;
const TICK_MS_VISIBLE = 250;
const TICK_MS_HIDDEN = 1_000;

function clampSec(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_SEC;
  return Math.max(MIN_SEC, Math.min(MAX_SEC, v));
}

export function wallDurationsFromSettings(
  raw?: WallTabWechselSekunden
): Record<WallView, number> {
  return {
    kuehlraum: clampSec(raw?.kuehlraum ?? DEFAULT_SEC),
    extern: clampSec(raw?.extern ?? DEFAULT_SEC),
    kalender: clampSec(raw?.kalender ?? DEFAULT_SEC),
    abholungen: clampSec(raw?.abholungen ?? DEFAULT_SEC),
    offen: clampSec(raw?.offen ?? DEFAULT_SEC),
  };
}

export function useWallTabRotation(
  durations: Record<WallView, number>,
  rotationPaused: boolean,
  /** z. B. Mobil: kein automatischer Tabwechsel */
  autoRotateEnabled = true,
  views: WallView[] = WALL_VIEWS
) {
  const activeViews = views.length > 0 ? views : [WALL_VIEWS[0]];
  const rotationEpochRef = useRef(Date.now());
  const [slide, setSlide] = useState(0);
  const [view, setView] = useState<WallView>(activeViews[0]);
  const [secondsLeft, setSecondsLeft] = useState(durations[activeViews[0]]);
  const rotationOff = rotationPaused || !autoRotateEnabled;

  const applyClock = useCallback(() => {
    const now = Date.now();
    const { slide: s, secondsLeft: left } = wallRotationPosition(
      rotationEpochRef.current,
      now,
      activeViews,
      durations
    );
    setSlide(s);
    setView(activeViews[s]);
    setSecondsLeft(left);
  }, [activeViews, durations]);

  const goToSlide = useCallback(
    (index: number) => {
      const i = ((index % activeViews.length) + activeViews.length) % activeViews.length;
      rotationEpochRef.current = wallRotationEpochForSlide(i, Date.now(), activeViews, durations);
      setSlide(i);
      setView(activeViews[i]);
      setSecondsLeft(durations[activeViews[i]]);
    },
    [durations, activeViews]
  );

  useEffect(() => {
    if (slide >= activeViews.length) {
      rotationEpochRef.current = wallRotationEpochForSlide(0, Date.now(), activeViews, durations);
      setSlide(0);
      setView(activeViews[0]);
      setSecondsLeft(durations[activeViews[0]]);
      return;
    }
    setView(activeViews[slide]);
  }, [activeViews, slide, durations]);

  useEffect(() => {
    if (rotationOff) return;

    let intervalId = 0;

    const armInterval = () => {
      window.clearInterval(intervalId);
      const ms =
        document.visibilityState === 'hidden' ? TICK_MS_HIDDEN : TICK_MS_VISIBLE;
      intervalId = window.setInterval(applyClock, ms);
    };

    applyClock();
    armInterval();

    const onResume = () => {
      armInterval();
      applyClock();
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
  }, [rotationOff, durations, activeViews, applyClock]);

  return { slide, view, secondsLeft, goToSlide, setView, setSlide, rotationOff };
}
