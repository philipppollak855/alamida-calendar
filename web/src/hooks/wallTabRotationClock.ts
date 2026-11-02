import type { WallView } from './useWallTabRotation';

export function wallRotationTotalSec(
  views: WallView[],
  durations: Record<WallView, number>
): number {
  return views.reduce((sum, v) => sum + Math.max(1, durations[v] ?? 1), 0);
}

/** Teilt Gesamtdauer gleichmäßig auf N Slides (Summe = totalSec). */
export function splitDurationAcrossSlides(totalSec: number, slideCount: number): number[] {
  const total = Math.max(1, Math.round(Number(totalSec)) || 1);
  if (slideCount <= 1) return [total];
  const base = Math.floor(total / slideCount);
  const remainder = total % slideCount;
  return Array.from({ length: slideCount }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Aktuelle Slide-Position aus Wanduhr (robust bei gedrosselten Timern im Hintergrund). */
export function wallRotationPosition(
  epochMs: number,
  nowMs: number,
  views: WallView[],
  durations: Record<WallView, number>
): { slide: number; secondsLeft: number } {
  if (views.length === 0) return { slide: 0, secondsLeft: 1 };

  const totalSec = wallRotationTotalSec(views, durations);
  let elapsedSec = Math.floor((nowMs - epochMs) / 1000);
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) elapsedSec = 0;

  const posInCycle = totalSec > 0 ? elapsedSec % totalSec : 0;
  let acc = 0;
  for (let i = 0; i < views.length; i++) {
    const d = Math.max(1, durations[views[i]] ?? 1);
    if (posInCycle < acc + d) {
      return { slide: i, secondsLeft: Math.max(1, acc + d - posInCycle) };
    }
    acc += d;
  }

  return { slide: 0, secondsLeft: Math.max(1, durations[views[0]] ?? 1) };
}

/** Epoch so setzen, dass `slide` jetzt aktiv ist (Countdown startet neu für diese Slide). */
export function wallRotationEpochForSlide(
  slide: number,
  nowMs: number,
  views: WallView[],
  durations: Record<WallView, number>
): number {
  let secondsBefore = 0;
  const i = Math.max(0, Math.min(slide, views.length - 1));
  for (let j = 0; j < i; j++) {
    secondsBefore += Math.max(1, durations[views[j]] ?? 1);
  }
  return nowMs - secondsBefore * 1000;
}
