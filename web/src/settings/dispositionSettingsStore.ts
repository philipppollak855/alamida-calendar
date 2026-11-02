import type { DispositionSettings } from '../types/dispositionSettings';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import { normalizeDispositionSettings } from './settingsNormalize';

let current = DEFAULT_DISPOSITION_SETTINGS;

export function getDispositionSettings(): DispositionSettings {
  return current;
}

export function setDispositionSettings(next: DispositionSettings): void {
  current = normalizeDispositionSettings(next);
}

export function getPrimaererKuehlraum() {
  return current.eigeneKuehlraeume[0] ?? DEFAULT_DISPOSITION_SETTINGS.eigeneKuehlraeume[0];
}

export function mergeDispositionSettings(
  raw: Partial<DispositionSettings> | undefined
): DispositionSettings {
  return normalizeDispositionSettings(raw ?? undefined);
}
