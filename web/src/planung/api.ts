import type { Konfiguration, KalenderEintrag, Rechte } from '../shared/rechte';
import type { Einsatz } from '../shared/bereitschaft';
import type { EinteilungPerson } from '../shared/einteilung';
import type { NeuerTermin } from '../shared/neuerTermin';
import type { AbwArt, Abwesenheit, Personal } from '../shared/abwesenheit';
import { ausGoogleEvent, type GoogleEvent, type Termin } from './planungLogic';

export interface Ich {
  angemeldet: boolean;
  benutzer?: { email: string; name?: string; bild?: string };
  rechte?: Rechte;
  gruppenNamen?: string[];
  anlegen?: { darf: boolean; dauer: Record<string, number> };
}

export interface AdminDaten {
  konfig: Konfiguration;
  kalenderGefunden: KalenderEintrag[];
  serviceAccountEmail: string;
  agentStatus?: AgentStatusInfo[];
}

export interface AgentStatusInfo {
  station: string;
  version: string;
  zeit: number;
  status: string;
  fehler?: string;
  vorsorge?: string;
  maske?: string;
  standardKalender?: string;
  termine?: number;
  zentral?: boolean;
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

export interface EinteilungDaten {
  einteilungen: { termin: string; personen: EinteilungPerson[] }[];
  darfEinteilen: boolean;
  personen: EinteilungPerson[];
}

export interface EinteilungRecht {
  darf: boolean;
  personen: EinteilungPerson[];
}

export async function termineLaden(): Promise<{ termine: Termin[]; fehler: string[]; einteilung: EinteilungRecht | null }> {
  const [r, e] = await Promise.all([
    holen<{ kalender: { kalender: KalenderEintrag; events: GoogleEvent[] }[]; fehler: string[] }>('/api/termine'),
    holen<EinteilungDaten>('/api/einteilung').catch(() => null),
  ]);
  const personal = new Map(e?.einteilungen.map((x) => [x.termin, x.personen]) ?? []);
  const termine = r.kalender.flatMap((k) =>
    k.events
      .map((ev) => ausGoogleEvent(ev, k.kalender.id, k.kalender.name))
      .filter((t): t is Termin => t !== null)
      .map((t) => (personal.has(t.id) ? { ...t, personal: personal.get(t.id) } : t)),
  );
  try {
    localStorage.setItem(LS_CACHE, JSON.stringify({ zeit: Date.now(), termine }));
  } catch {
    /* Speicher voll */
  }
  return { termine, fehler: r.fehler, einteilung: e ? { darf: e.darfEinteilen, personen: e.personen } : null };
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

const mitVon = (pfad: string, von?: string) => (von ? `${pfad}${pfad.includes('?') ? '&' : '?'}von=${von}` : pfad);
export const bereitschaftLaden = (von?: string) => holen<BereitschaftDaten>(mitVon('/api/bereitschaft', von));
export const bereitschaftEintragen = (e: { email?: string; von: string; bis: string }, ab?: string) =>
  holen<BereitschaftDaten>(mitVon('/api/bereitschaft', ab), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e) });
export const bereitschaftAustragen = (id: string, ab?: string) =>
  holen<BereitschaftDaten>(mitVon(`/api/bereitschaft?id=${encodeURIComponent(id)}`, ab), { method: 'DELETE' });

export interface AbwesenheitDaten {
  ich: { email: string; name?: string };
  darfVerwalten: boolean;
  personal: Personal[];
  eintraege: Abwesenheit[];
  personen: { email: string; name?: string }[];
}

const jsonInit = (method: string, daten: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(daten) });
export const abwesenheitLaden = () => holen<AbwesenheitDaten>('/api/abwesenheit');
export const abwesenheitEintragen = (e: { email?: string; art: AbwArt; von: string; bis: string; stunden?: number; notiz?: string }) =>
  holen<AbwesenheitDaten>('/api/abwesenheit', jsonInit('POST', e));
export const abwesenheitEntscheiden = (id: string, status: 'genehmigt' | 'abgelehnt', grund?: string) =>
  holen<AbwesenheitDaten>('/api/abwesenheit?aktion=entscheiden', jsonInit('POST', { id, status, grund }));
export const abwesenheitLoeschen = (id: string) => holen<AbwesenheitDaten>(`/api/abwesenheit?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
export const personalSpeichern = (personal: Personal[]) => holen<AbwesenheitDaten>('/api/abwesenheit?aktion=personal', jsonInit('PUT', { personal }));
export const altdatenImportieren = (daten: { personal: Personal[]; abwesenheiten: Pick<Abwesenheit, 'email' | 'art' | 'von' | 'bis'>[] }) =>
  holen<AbwesenheitDaten>('/api/abwesenheit?aktion=import', jsonInit('POST', daten));

export const einteilungSpeichern = (termin: string, personen: string[]) =>
  holen<{ termin: string; personen: EinteilungPerson[] }>('/api/einteilung', jsonInit('PUT', { termin, personen }));

export async function terminAnlegen(t: NeuerTermin): Promise<Termin> {
  const r = await holen<{ kalender: KalenderEintrag; event: GoogleEvent }>('/api/termin', jsonInit('POST', t));
  const termin = ausGoogleEvent(r.event, r.kalender.id, r.kalender.name);
  if (!termin) throw new Error('Termin konnte nicht gelesen werden');
  return termin;
}

export const terminLoeschen = (id: string) => holen<{ ok: boolean }>(`/api/termin?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
