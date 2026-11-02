import type { Konfiguration, KalenderEintrag, Rechte } from '../shared/rechte';
import type { Einsatz } from '../shared/bereitschaft';
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
/** Sitzung aus der Hub-Anmeldung (eingebettet im Hub werden Cookies blockiert, daher Bearer). */
const SS_HUB = 'alamida.hubSitzung';

function hubSitzung(): string | null {
  try {
    return sessionStorage.getItem(SS_HUB);
  } catch {
    return null;
  }
}

async function holen<T>(pfad: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const hub = hubSitzung();
  if (hub) headers.set('authorization', `Bearer ${hub}`);
  const res = await fetch(pfad, { credentials: 'same-origin', ...init, headers });
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

/** Anmeldung mit dem Ticket, das der Bestattung Stranz HUB beim Öffnen mitgibt (#hub_ticket=…). */
export async function hubAnmelden(ticket: string): Promise<void> {
  const r = await holen<{ sitzung: string }>('/api/auth/hub', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticket }),
  });
  try {
    sessionStorage.setItem(SS_HUB, r.sitzung);
  } catch {
    /* ohne sessionStorage bleibt nur das Cookie */
  }
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
  try {
    sessionStorage.removeItem(SS_HUB);
  } catch {
    /* egal */
  }
  await fetch('/api/auth/logout', { method: 'POST' });
}

export const adminLaden = () => holen<AdminDaten>('/api/admin');
export const adminSpeichern = (konfig: Konfiguration) =>
  holen<{ konfig: Konfiguration }>('/api/admin', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(konfig) });

export interface BereitschaftDaten {
  eintraege: Einsatz[];
  darfPlanen: boolean;
  ich: { email: string; name?: string };
  personen: { email: string; name?: string }[];
}

export const bereitschaftLaden = () => holen<BereitschaftDaten>('/api/bereitschaft');
export const bereitschaftEintragen = (e: { email?: string; von: string; bis: string }) =>
  holen<BereitschaftDaten>('/api/bereitschaft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e) });
export const bereitschaftAustragen = (id: string) =>
  holen<BereitschaftDaten>(`/api/bereitschaft?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
