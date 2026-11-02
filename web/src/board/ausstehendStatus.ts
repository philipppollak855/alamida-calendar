import { parseDatumDe } from './dateUtils';

export function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function calendarDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Status anhand Termindatum und heutigem Kalendertag (unabhängig vom Agent-Sync). */
export function resolveAusstehendStatus(
  terminAm?: string,
  storedStatus?: string
): string {
  if (storedStatus === 'abholung_noetig') return 'abholung_noetig';

  const ms = parseDatumDe(terminAm);
  if (ms === Number.MAX_SAFE_INTEGER) return storedStatus ?? 'geplant';

  const terminDay = new Date(ms);
  terminDay.setHours(0, 0, 0, 0);
  const terminMs = terminDay.getTime();
  const todayMs = startOfTodayMs();

  if (terminMs < todayMs) return 'vergangen';
  if (terminMs === todayMs) return 'heute';
  return 'geplant';
}

export function isAusstehendHeuteOrGeplant(a: {
  terminAm?: string;
  abholungAm?: string;
  status?: string;
}): boolean {
  const s = resolveAusstehendStatus(a.terminAm ?? a.abholungAm, a.status);
  return s === 'heute' || s === 'geplant';
}

export function isAusstehendHeute(a: {
  terminAm?: string;
  abholungAm?: string;
  status?: string;
}): boolean {
  return resolveAusstehendStatus(a.terminAm ?? a.abholungAm, a.status) === 'heute';
}
