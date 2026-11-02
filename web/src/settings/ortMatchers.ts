import type { DispositionSettings, EigenerKuehlraumConfig } from '../types/dispositionSettings';
import { getDispositionSettings } from './dispositionSettingsStore';
import {
  istKrematoriumOrt,
  istKrankenhausOrt,
  istPflegeheimOrt,
  istBestattungOrt,
  matchEigenerKuehlraumOrt,
  classifyOrt,
} from './recognitionEngine';

export { classifyOrt } from './recognitionEngine';

export function ortLabel(ort: string): string {
  return ort.trim().replace(/\s+/g, ' ');
}

export {
  canonicalKrankenhausAnzeigeLabel,
  collectKrankenhausKandidaten,
  isGenericKrankenhausKey,
  krankenhausOrtKey,
  preferKrankenhausAnzeigeLabel,
  resolveBestKrankenhausOrt,
} from './krankenhausOrt';
export { parseUeberfuehrungRoute } from '../board/routeParse';

export function istKrematorium(ort?: string, settings?: DispositionSettings): boolean {
  if (!ort?.trim()) return false;
  return istKrematoriumOrt(ort, settings ?? getDispositionSettings());
}

export function istKrankenhaus(ort?: string, settings?: DispositionSettings): boolean {
  if (!ort?.trim()) return false;
  return istKrankenhausOrt(ort, settings ?? getDispositionSettings());
}

export function istPflegeheim(ort?: string, settings?: DispositionSettings): boolean {
  if (!ort?.trim()) return false;
  return istPflegeheimOrt(ort, settings ?? getDispositionSettings());
}

export function istBestattung(ort?: string, settings?: DispositionSettings): boolean {
  if (!ort?.trim()) return false;
  return istBestattungOrt(ort, settings ?? getDispositionSettings());
}

export function matchEigenerKuehlraum(
  ort?: string,
  settings?: DispositionSettings
): EigenerKuehlraumConfig | null {
  if (!ort?.trim()) return null;
  return matchEigenerKuehlraumOrt(ort, settings ?? getDispositionSettings());
}

export function matchKuehlraumConfig(kuehlraumId?: string) {
  return matchEigenerKuehlraum(kuehlraumId);
}
