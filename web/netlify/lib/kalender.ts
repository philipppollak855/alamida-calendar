import type { KalenderEintrag, Konfiguration } from '../../src/shared/rechte';
import { googleGet } from './server';

/** Kalender aus der Konfiguration, aus CALENDAR_IDS und aus der Kalenderliste des Service Accounts. */
export async function alleKalender(konfig: Konfiguration, envIds: string): Promise<KalenderEintrag[]> {
  const map = new Map<string, KalenderEintrag>();
  try {
    const r = await googleGet<{ items?: { id: string; summary: string }[] }>('/users/me/calendarList', { maxResults: '250' });
    for (const c of r.items ?? []) map.set(c.id, { id: c.id, name: c.summary });
  } catch {
    /* Service Account ohne Kalenderliste */
  }
  for (const id of envIds.split(/[,;\s]+/).filter(Boolean)) if (!map.has(id)) map.set(id, { id, name: id });
  for (const k of konfig.kalender) map.set(k.id, k);
  return [...map.values()];
}
