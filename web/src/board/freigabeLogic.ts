import { parseDatumDeToDate } from './dateUtils';

function startOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/**
 * Freigabe gilt erst ab heute (Kalendertag).
 * Zukünftiges Freigabedatum → Eintrag bleibt „nicht frei“ (rot).
 */
export function istFreigabeWirksam(
  freigabeFrei?: boolean,
  freigabeDatum?: string,
  ref = new Date()
): boolean {
  if (!freigabeFrei) return false;
  const freiAm = parseDatumDeToDate(freigabeDatum);
  if (!freiAm) return true;
  return startOfDayMs(freiAm) <= startOfDayMs(ref);
}

export function freigabePersonCssClass(
  freigabeFrei?: boolean,
  freigabeDatum?: string,
  ref = new Date()
): 'is-frei-erfasst' | 'is-nicht-frei' {
  return istFreigabeWirksam(freigabeFrei, freigabeDatum, ref)
    ? 'is-frei-erfasst'
    : 'is-nicht-frei';
}
