import { useCallback, useRef } from 'react';

const MIN_SWIPE_PX = 48;
const MAX_SWIPE_MS = 500;
const HORIZONTAL_RATIO = 1.15;

type TouchPoint = { x: number; y: number; t: number };

/** Mobil: horizontaler Wisch an den Bildschirmrändern wechselt Wand-Tabs. */
export function useWallEdgeSwipe(
  enabled: boolean,
  slide: number,
  goToSlide: (index: number) => void
) {
  const start = useRef<TouchPoint | null>(null);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    },
    [enabled]
  );

  const clearStart = useCallback(() => {
    start.current = null;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !start.current) return;
      const st = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - st.x;
      const dy = t.clientY - st.y;
      const dt = Date.now() - st.t;

      if (dt > MAX_SWIPE_MS) return;
      if (Math.abs(dx) < MIN_SWIPE_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) return;

      if (dx < 0) goToSlide(slide + 1);
      else goToSlide(slide - 1);
    },
    [enabled, slide, goToSlide]
  );

  return { onTouchStart, onTouchEnd, onTouchCancel: clearStart };
}
