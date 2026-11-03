import type { Konfiguration, KalenderEintrag, Rechte } from '../shared/rechte';
import type { Einsatz } from '../shared/bereitschaft';
import type { EinteilungPerson } from '../shared/einteilung';
import type { NeuerTermin } from '../shared/neuerTermin';
import type { AbwArt, Abwesenheit, Personal } from '../shared/abwesenheit';
import { ausGoogleEvent, type GoogleEvent, type Termin } from './planungLogic';
import { cacheLeeren, cacheLesen, cacheSchreiben, istOffline, OfflineFehler } from './offlineCache';

export interface Ich {
  angemeldet: boolean;
  benutzer?: { email: string; name?: string; bild?: string };
  rechte?: Rechte;
  gruppenNamen?: string[];
  anlegen?: { darf: boolean; dauer: Record<string, number> };
  kiosk?: boolean;
  /** Gesetzt, wenn ohne Verbindung der zuletzt gespeicherte Stand verwendet wird. */
  offline?: boolean;
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

const LS_CACHE_ALT = 'alamida.termineCache';
const LS_ICH = 'alamida.ich';
/** Benutzer, für den offline zwischengespeichert wird (leer = nichts speichern, z. B. Kiosk). */
let benutzer = '';

function ls(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function gespeichertesIch(): Ich | null {
  try {
    return JSON.parse(ls()?.getItem(LS_ICH) ?? 'null') as Ich | null;
  } catch {
    return null;
  }
}

function alleCachesLeeren() {
  const s = ls();
  if (!s) return;
  cacheLeeren(s);
  s.removeItem(LS_CACHE_ALT);
  s.removeItem(LS_ICH);
}

/** Lädt vom Server und merkt sich das Ergebnis; ohne Verbindung kommt der letzte Stand (mit offlineStand). */
async function mitCache<T extends object>(schluessel: string, laden: () => Promise<T>): Promise<T & { offlineStand?: number }> {
  const s = ls();
  try {
    const d = await laden();
    if (s) cacheSchreiben(s, benutzer, schluessel, d);
    return d;
  } catch (e) {
    const c = istOffline(e) && s ? cacheLesen<T>(s, benutzer, schluessel) : null;
    if (c) return { ...c.daten, offlineStand: c.zeit };
    throw e;
  }
}
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
  let res: Response;
  try {
    res = await fetch(pfad, { credentials: 'same-origin', ...init, headers });
  } catch {
    throw new OfflineFehler();
  }
  const daten = (await res.json().catch(() => ({}))) as T & { fehler?: string };
  if (!res.ok) throw new Error(daten.fehler ?? `Fehler ${res.status}`);
  return daten;
}

export async function ichLaden(): Promise<Ich> {
  try {
    const i = await holen<Ich>('/api/me');
    benutzer = i.angemeldet && !i.kiosk ? (i.benutzer?.email ?? '').toLowerCase() : '';
    if (benutzer) ls()?.setItem(LS_ICH, JSON.stringify(i));
    else alleCachesLeeren();
    return i;
  } catch (e) {
    const c = istOffline(e) ? gespeichertesIch() : null;
    if (!c?.angemeldet) throw e;
    benutzer = (c.benutzer?.email ?? '').toLowerCase();
    return { ...c, offline: true };
  }
}

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
  const s = ls();
  if (s) cacheSchreiben(s, benutzer, 'termine', termine);
  return { termine, fehler: r.fehler, einteilung: e ? { darf: e.darfEinteilen, personen: e.personen } : null };
}

/** Zuletzt geladene Termine (für Offline-Betrieb der App). */
export function termineAusCache(): { zeit: Date; termine: Termin[] } | null {
  const s = ls();
  const wer = benutzer || (gespeichertesIch()?.benutzer?.email ?? '').toLowerCase();
  const c = s ? cacheLesen<(Termin & { start: string; ende: string })[]>(s, wer, 'termine') : null;
  if (!c || !Array.isArray(c.daten)) return null;
  return { zeit: new Date(c.zeit), termine: c.daten.map((t) => ({ ...t, start: new Date(t.start), ende: new Date(t.ende) })) };
}

export async function abmelden(): Promise<void> {
  alleCachesLeeren();
  benutzer = '';
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
export const bereitschaftLaden = (von?: string) => mitCache(`bereitschaft:${von ?? ''}`, () => holen<BereitschaftDaten>(mitVon('/api/bereitschaft', von)));
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
  /** Externe Kräfte (im Hub markiert): kein Urlaubskonto, keine Krankenstatistik. */
  externe?: string[];
}

const jsonInit = (method: string, daten: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(daten) });
export const abwesenheitLaden = () => mitCache('abwesenheit', () => holen<AbwesenheitDaten>('/api/abwesenheit'));
export const abwesenheitEintragen = (e: { email?: string; art: AbwArt; von: string; bis: string; stunden?: number; notiz?: string }) =>
  holen<AbwesenheitDaten>('/api/abwesenheit', jsonInit('POST', e));
export const abwesenheitEntscheiden = (id: string, status: 'genehmigt' | 'abgelehnt', grund?: string) =>
  holen<AbwesenheitDaten>('/api/abwesenheit?aktion=entscheiden', jsonInit('POST', { id, status, grund }));
export const abwesenheitLoeschen = (id: string) => holen<AbwesenheitDaten>(`/api/abwesenheit?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
const belegAdresse = (id: string, beleg?: string) =>
  `/api/abwesenheit?aktion=beleg&id=${encodeURIComponent(id)}${beleg ? `&beleg=${encodeURIComponent(beleg)}` : ''}`;
export const belegHochladen = (id: string, datei: Blob, name: string) =>
  holen<AbwesenheitDaten>(belegAdresse(id), { method: 'POST', headers: { 'content-type': datei.type, 'x-dateiname': encodeURIComponent(name) }, body: datei });
export const belegEntfernen = (id: string, beleg: string) => holen<AbwesenheitDaten>(belegAdresse(id, beleg), { method: 'DELETE' });
/** Lädt eine Bestätigung als Datei (mit Hub-Sitzung, daher nicht als einfacher Link). */
export async function belegDatei(id: string, beleg: string): Promise<Blob> {
  const headers = new Headers();
  const hub = hubSitzung();
  if (hub) headers.set('authorization', `Bearer ${hub}`);
  let res: Response;
  try {
    res = await fetch(belegAdresse(id, beleg), { credentials: 'same-origin', headers });
  } catch {
    throw new OfflineFehler();
  }
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { fehler?: string };
    throw new Error(d.fehler ?? `Fehler ${res.status}`);
  }
  return res.blob();
}
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
