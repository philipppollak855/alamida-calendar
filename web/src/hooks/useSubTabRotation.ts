import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  splitDurationAcrossSlides,
  wallRotationEpochForSlide,
  wallRotationPosition,
  wallRotationTotalSec,
} from './wallTabRotationClock';

const TICK_MS_VISIBLE = 250;
const TICK_MS_HIDDEN = 1_000;

/** Automatischer Wechsel zwischen Unter-Tabs (z. B. mehrere Kühlräume). */
export function useSubTabRotation(
  slideIds: string[],
  /** Gesamtdauer für einen kompletten Durchlauf aller Slides (wird gleichmäßig geteilt) */
  totalDurationSec: number,
  enabled: boolean,
  paused: boolean
) {
  const slides = slideIds.length > 0 ? slideIds : [''];
  const rotationOff = paused || !enabled || slides.length <= 1;
  const slideDurations = useMemo(
    () => splitDurationAcrossSlides(totalDurationSec, slides.length),
    [totalDurationSec, slides.length]
  );
  const durations = useMemo(() => {
    const map: Record<string, number> = {};
    slides.forEach((id, i) => {
      map[id] = slideDurations[i] ?? 1;
    });
    return map;
  }, [slides, slideDurations]);
  const views = slides as unknown as import('./useWallTabRotation').WallView[];
  const perSlideSec = slideDurations[0] ?? 1;

  const rotationEpochRef = useRef(Date.now());
  const [slide, setSlide] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(perSlideSec);

  const applyClock = useCallback(() => {
    const now = Date.now();
    const { slide: s, secondsLeft: left } = wallRotationPosition(
      rotationEpochRef.current,
      now,
      views,
      durations
    );
    setSlide(Math.min(s, slides.length - 1));
    setSecondsLeft(left);
  }, [views, durations, slides.length]);

  const goToSlide = useCallback(
    (index: number) => {
      const i = ((index % slides.length) + slides.length) % slides.length;
      rotationEpochRef.current = wallRotationEpochForSlide(i, Date.now(), views, durations);
      setSlide(i);
      setSecondsLeft(durations[slides[i]] ?? perSlideSec);
    },
    [durations, views, slides, perSlideSec]
  );

  useEffect(() => {
    if (slide >= slides.length) {
      rotationEpochRef.current = wallRotationEpochForSlide(0, Date.now(), views, durations);
      setSlide(0);
      setSecondsLeft(durations[slides[0]] ?? perSlideSec);
    }
  }, [slides, slide, durations, views, perSlideSec]);

  useEffect(() => {
    if (rotationOff) return;

    let intervalId = 0;
    const armInterval = () => {
      window.clearInterval(intervalId);
      const ms = document.visibilityState === 'hidden' ? TICK_MS_HIDDEN : TICK_MS_VISIBLE;
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
  }, [rotationOff, applyClock]);

  const cycleDurationSec = wallRotationTotalSec(views, durations);

  return {
    slide,
    activeId: slides[slide] ?? slides[0],
    secondsLeft,
    perSlideSec,
    cycleDurationSec,
    goToSlide,
    rotationOff,
    slideCount: slides.length,
  };
}
