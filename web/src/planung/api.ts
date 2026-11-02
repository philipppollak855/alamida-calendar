import type { Konfiguration, KalenderEintrag, Rechte } from '../shared/rechte';
import { ausGoogleEvent, type GoogleEvent, type Termin } from './planungLogic';

export interface Ich {
  angemeldet: boolean;
  benutzer?: { email: string; name?: string; bild?: string };
  rechte?: Rechte;
  gruppenNamen?: string[];
}

export interface AdminDaten {
  konfig: Konfiguration;
  kalenderGefunden: KalenderEintrag[];
  serviceAccountEmail: string;
}

const LS_CACHE = 'alamida.termineCache';

async function holen<T>(pfad: string, init?: RequestInit): Promise<T> {
  const res = await fetch(pfad, { credentials: 'same-origin', ...init });
  const daten = (await res.json().catch(() => ({}))) as T & { fehler?: string };
  if (!res.ok) throw new Error(daten.fehler ?? `Fehler ${res.status}`);
  return daten;
}

export const ichLaden = () => holen<Ich>('/api/me');

/** Rückkehr von Google auf die Startseite (?code=…&state=…): Code an den Server weiterreichen. */
export async function anmeldungAbschliessen(code: string, state: string): Promise<void> {
  await holen<{ ok: boolean }>('/api/auth/callback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, state }),
  });
}

export async function termineLaden(): Promise<{ termine: Termin[]; fehler: string[] }> {
  const r = await holen<{ kalender: { kalender: KalenderEintrag; events: GoogleEvent[] }[]; fehler: string[] }>('/api/termine');
  const termine = r.kalender.flatMap((k) =>
    k.events.map((e) => ausGoogleEvent(e, k.kalender.id, k.kalender.name)).filter((t): t is Termin => t !== null),
  );
  try {
    localStorage.setItem(LS_CACHE, JSON.stringify({ zeit: Date.now(), termine }));
  } catch {
    /* Speicher voll */
  }
  return { termine, fehler: r.fehler };
}

/** Zuletzt geladene Termine (für Offline-Betrieb der App). */
export function termineAusCache(): { zeit: Date; termine: Termin[] } | null {
  try {
    const c = JSON.parse(localStorage.getItem(LS_CACHE) ?? 'null') as { zeit: number; termine: (Termin & { start: string; ende: string })[] } | null;
    if (!c) return null;
    return { zeit: new Date(c.zeit), termine: c.termine.map((t) => ({ ...t, start: new Date(t.start), ende: new Date(t.ende) })) };
  } catch {
    return null;
  }
}

export async function abmelden(): Promise<void> {
  localStorage.removeItem(LS_CACHE);
  await fetch('/api/auth/logout', { method: 'POST' });
}

export const adminLaden = () => holen<AdminDaten>('/api/admin');
export const adminSpeichern = (konfig: Konfiguration) =>
  holen<{ konfig: Konfiguration }>('/api/admin', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(konfig) });
