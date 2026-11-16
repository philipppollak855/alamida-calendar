import { useRef } from 'react';
import { addDays, addMonths } from 'date-fns';

/** Waagrechtes Wischen (Handy/Tablet): links = vor, rechts = zurück. Senkrechtes Scrollen bleibt unberührt. */
export function useWischen(blaettern: (richtung: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const p = e.touches[0];
      start.current = e.touches.length === 1 ? { x: p.clientX, y: p.clientY, t: Date.now() } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      const p = e.changedTouches[0];
      if (!s || !p) return;
      const dx = p.clientX - s.x;
      const dy = p.clientY - s.y;
      if (Math.abs(dx) >= 60 && Math.abs(dy) < Math.abs(dx) * 0.6 && Date.now() - s.t < 800) blaettern(dx < 0 ? 1 : -1);
    },
  };
}

/** Neues Datum je Ansicht: Monat ±1 Monat, Woche ±7 Tage, Tag ±1 Tag. */
export const geblaettert = (datum: Date, ansicht: string, richtung: 1 | -1) =>
  ansicht === 'month' ? addMonths(datum, richtung) : ansicht === 'week' ? addDays(datum, 7 * richtung) : ansicht === 'day' ? addDays(datum, richtung) : datum;
