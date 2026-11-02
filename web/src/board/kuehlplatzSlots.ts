import type { Sterbefall } from '../types';
import type { EigenerKuehlraumConfig } from '../types/dispositionSettings';
import { resolveFallKuehlraumId } from './kuehlraumZuordnung';
import { isImEigenenKuehlraum } from './kuehlraumLogic';

export function resolveSlotKuehlraumId(s: Sterbefall): string | undefined {
  const manual = s.kuehlraumIdDisposition?.trim();
  if (manual) return manual;
  return resolveFallKuehlraumId(s);
}

function parsePlatz(raw?: string): number | null {
  const n = parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/** Belegt Slots — Disposition-Platz hat Vorrang vor Alamida. */
export function belegeKuehlraumSlots(
  sterbefaelle: Sterbefall[],
  cfg: EigenerKuehlraumConfig
): (Sterbefall | null)[] {
  const slots: (Sterbefall | null)[] = Array(cfg.plaetze).fill(null);
  const deferred: Sterbefall[] = [];

  for (const s of sterbefaelle) {
    if (!isImEigenenKuehlraum(s)) continue;
    if (resolveSlotKuehlraumId(s) !== cfg.id) continue;

    const manualPlatz = parsePlatz(s.kuehlplatzDisposition);
    if (manualPlatz != null && manualPlatz <= cfg.plaetze && s.kuehlraumIdDisposition === cfg.id) {
      const idx = manualPlatz - 1;
      if (slots[idx] === null) slots[idx] = s;
      else deferred.push(s);
      continue;
    }

    const alamidaPlatz = parsePlatz(s.kuehlplatz);
    if (alamidaPlatz != null && alamidaPlatz <= cfg.plaetze) {
      const idx = alamidaPlatz - 1;
      if (slots[idx] === null) slots[idx] = s;
      else deferred.push(s);
      continue;
    }

    deferred.push(s);
  }

  for (const s of deferred) {
    const idx = slots.findIndex((x) => x === null);
    if (idx >= 0) slots[idx] = s;
  }

  return slots;
}
