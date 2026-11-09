import { createHmac, createPublicKey, createSign, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { STANDARD_KONFIG, konfigPruefen, rechteFuer, verzeichnisAnwenden, verzeichnisPruefen, type Konfiguration, type Rechte, type Verzeichnis } from '../../src/shared/rechte';
import type { Einsatz } from '../../src/shared/bereitschaft';
import { heuteWien, laufendBis, personalPruefen, type Abwesenheit, type Personal } from '../../src/shared/abwesenheit';
import type { AgentStatus } from './agent';
import type { Einteilung } from '../../src/shared/einteilung';
import { zeitkontoPruefen, type BerichtArchiv, type ZeitkontoDaten } from '../../src/shared/zeitkonto';
import type { Mitschrift } from '../../src/shared/telefon';
import { telefonJetzt, type TelEinsatz, type TelMuster, type TelSegment } from '../../src/shared/telefonplan';
import { emailErsetzen } from '../../src/shared/emailUmzug';

export const SESSION_COOKIE = 'alamida_session';
export const SESSION_TAGE = 90;

export function env(name: string): string {
  return (globalThis as { Netlify?: { env: { get(n: string): string | undefined } } }).Netlify?.env.get(name) ?? process.env[name] ?? '';
}

export const clientId = () => env('GOOGLE_CLIENT_ID') || env('VITE_GOOGLE_CLIENT_ID');
/** Muss exakt einer „Autorisierten Weiterleitungs-URI“ der OAuth-Client-ID entsprechen. */
export const redirectUri = (origin: string) => env('OAUTH_REDIRECT_URI') || `${origin}/api/auth/callback`;
export const adminEmails = () => env('ADMIN_EMAILS').split(/[,;\s]+/).filter(Boolean);

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export interface Sitzung {
  email: string;
  name?: string;
  bild?: string;
  exp: number;
  /** Über ein Kiosk-Gerät des Hubs angemeldet: nie Administrator, Sitzung endet mit der Hub-Sitzung. */
  kiosk?: boolean;
}

/** Rechte einer Sitzung; Kiosk-Sitzungen erhalten keine Admin-Rechte. */
export function rechteFuerSitzung(s: Pick<Sitzung, 'email' | 'kiosk'>, konfig: Konfiguration): Rechte {
  return s.kiosk
    ? rechteFuer(s.email, { ...konfig, benutzer: konfig.benutzer.map((b) => ({ ...b, admin: false })) })
    : rechteFuer(s.email, konfig, adminEmails());
}

function hmac(daten: string): string {
  const geheim = env('SESSION_SECRET');
  if (geheim.length < 32) throw new Error('SESSION_SECRET fehlt');
  return createHmac('sha256', geheim).update(daten).digest('base64url');
}

export function sitzungSignieren(s: Sitzung): string {
  const daten = b64url(JSON.stringify(s));
  return `${daten}.${hmac(daten)}`;
}

export function sitzungPruefen(wert: string | undefined): Sitzung | null {
  if (!wert) return null;
  const [daten, sig] = wert.split('.');
  if (!daten || !sig) return null;
  const erwartet = Buffer.from(hmac(daten));
  const ist = Buffer.from(sig);
  if (erwartet.length !== ist.length || !timingSafeEqual(erwartet, ist)) return null;
  const s = JSON.parse(Buffer.from(daten, 'base64url').toString()) as Sitzung;
  return s.exp > Date.now() ? s : null;
}

export function cookies(req: Request): Record<string, string> {
  return Object.fromEntries(
    (req.headers.get('cookie') ?? '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter((p) => p.length >= 2)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  );
}

export function cookie(name: string, wert: string, maxAgeSek: number): string {
  return `${name}=${encodeURIComponent(wert)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSek}`;
}

export const zufall = () => randomBytes(24).toString('base64url');

export function json(daten: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

const store = () => getStore({ name: 'alamida', consistency: 'strong' });

/** Nur die im Kalender gespeicherte Konfiguration (ohne Hub-Verzeichnis). */
export async function konfigLokal(): Promise<Konfiguration> {
  const k = (await store().get('konfiguration', { type: 'json' })) as unknown;
  return k ? konfigPruefen(k) : STANDARD_KONFIG;
}

export async function konfigLaden(): Promise<Konfiguration> {
  const [lokal, v] = await Promise.all([konfigLokal(), verzeichnisLaden()]);
  return v ? verzeichnisAnwenden(lokal, v) : lokal;
}

export const HUB_URL = () => env('HUB_URL') || 'https://bestattung-stranz-hub.netlify.app';
let verzeichnisCache: { v: Verzeichnis; bis: number } | null = null;

/**
 * Mitarbeiter & Gruppen aus dem Hub (eine Quelle). Server zu Server mit HUB_VERZEICHNIS_SCHLUESSEL, 60 s im Speicher;
 * ist der Hub nicht erreichbar, gilt die zuletzt geholte Kopie. Ohne Schlüssel: nur die Kalender-eigene Liste.
 */
export async function verzeichnisLaden(): Promise<Verzeichnis | null> {
  const schluessel = env('HUB_VERZEICHNIS_SCHLUESSEL');
  if (!schluessel) return null;
  if (verzeichnisCache && verzeichnisCache.bis > Date.now()) return verzeichnisCache.v;
  try {
    const res = await fetch(`${HUB_URL()}/api/verzeichnis`, { headers: { authorization: `Bearer ${schluessel}` }, signal: AbortSignal.timeout(5000) });
    const v = verzeichnisPruefen(await res.json());
    if (!res.ok || !v) throw new Error(`Hub-Verzeichnis: ${res.status}`);
    verzeichnisCache = { v, bis: Date.now() + 60_000 };
    void store().setJSON('hub-verzeichnis', v).catch(() => undefined);
    return v;
  } catch (e) {
    console.warn((e as Error).message);
    const kopie = verzeichnisPruefen(await store().get('hub-verzeichnis', { type: 'json' }).catch(() => null));
    if (kopie) verzeichnisCache = { v: kopie, bis: Date.now() + 15_000 };
    return kopie;
  }
}

const agentSchluessel = (station: string) => `agent-status/${encodeURIComponent(station)}`;
export const agentStatusSpeichern = (s: AgentStatus) => store().setJSON(agentSchluessel(s.station), s);
export async function agentStatusLaden(): Promise<AgentStatus[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: 'agent-status/' });
  const l = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<AgentStatus | null>));
  return l.filter((x): x is AgentStatus => !!x).sort((a, b) => b.zeit - a.zeit);
}

export async function konfigSpeichern(k: Konfiguration): Promise<void> {
  await store().setJSON('konfiguration', k);
}

/* Bereitschaft: ein Blob je Eintrag („bereitschaft/<Enddatum>/<id>“), damit gleichzeitige Änderungen sich nicht überschreiben. */
const einsatzSchluessel = (e: Pick<Einsatz, 'id' | 'bis'>) => `bereitschaft/${e.bis.slice(0, 10)}/${e.id}`;

/** Alle Einträge, die am Tag `ab` (JJJJ-MM-TT) oder später enden. */
export async function bereitschaftLaden(ab: string): Promise<Einsatz[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: 'bereitschaft/' });
  const keys = blobs.map((b) => b.key).filter((k) => k.split('/')[1] >= ab);
  const l = await Promise.all(keys.map((k) => s.get(k, { type: 'json' }) as Promise<Einsatz | null>));
  return l.filter((e): e is Einsatz => !!e).sort((a, b) => a.von.localeCompare(b.von));
}

export const einsatzSpeichern = (e: Einsatz) => store().setJSON(einsatzSchluessel(e), e);
export const einsatzLoeschen = (e: Einsatz) => store().delete(einsatzSchluessel(e));

/* Telefonbereitschaft: ein Blob je Eintrag, Muster gemeinsam. */
const telPlanSchluessel = (e: Pick<TelEinsatz, 'id' | 'bis'>) => `telefonplan/eintrag/${e.bis.slice(0, 10)}/${e.id}`;
export async function telPlanLaden(ab: string): Promise<TelEinsatz[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: 'telefonplan/eintrag/' });
  const keys = blobs.map((b) => b.key).filter((k) => k.split('/')[2] >= ab);
  const l = await Promise.all(keys.map((k) => s.get(k, { type: 'json' }) as Promise<TelEinsatz | null>));
  return l.filter((e): e is TelEinsatz => !!e).sort((a, b) => a.von.localeCompare(b.von));
}
export const telPlanSpeichern = (e: TelEinsatz) => store().setJSON(telPlanSchluessel(e), e);
export const telPlanLoeschen = (e: TelEinsatz) => store().delete(telPlanSchluessel(e));
export const telMusterLaden = async () => ((await store().get('telefonplan/muster', { type: 'json' })) as TelMuster[] | null) ?? [];
export const telMusterSpeichern = (l: TelMuster[]) => store().setJSON('telefonplan/muster', l);
/** Wer gerade Telefondienst hat (Ortszeit Wien). */
export async function telefonJetztLaden(): Promise<TelSegment | null> {
  const jetzt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date())
    .replace(' ', 'T');
  const gestern = new Date(Date.parse(`${jetzt.slice(0, 10)}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const [l, m] = await Promise.all([telPlanLaden(gestern), telMusterLaden()]);
  return telefonJetzt(l, m, jetzt);
}

/* Urlaub / Krank: ein Blob je Abwesenheit, Personal-Stammdaten als ein Blob. */
const abwSchluessel = (id: string) => `abwesenheit/eintrag/${id}`;

export async function abwesenheitenLaden(): Promise<Abwesenheit[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: 'abwesenheit/eintrag/' });
  const l = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<Abwesenheit | null>));
  const heute = heuteWien();
  return l
    .filter((e): e is Abwesenheit => !!e)
    .map((e) => laufendBis(e, heute))
    .sort((a, b) => a.von.localeCompare(b.von));
}

export const abwesenheitSpeichern = (e: Abwesenheit) => store().setJSON(abwSchluessel(e.id), e);
export const abwesenheitLoeschen = (e: Pick<Abwesenheit, 'id'>) => store().delete(abwSchluessel(e.id));
const belegSchluessel = (id: string) => `abwesenheit/beleg/${id}`;
export const belegSpeichern = (id: string, daten: ArrayBuffer, typ: string) => store().set(belegSchluessel(id), daten, { metadata: { typ } });
export const belegLaden = (id: string) => store().get(belegSchluessel(id), { type: 'arrayBuffer' });
export const belegLoeschen = (id: string) => store().delete(belegSchluessel(id));
export const personalLaden = async (): Promise<Personal[]> => personalPruefen(await store().get('abwesenheit-personal', { type: 'json' }));
export const personalSpeichern = (p: Personal[]) => store().setJSON('abwesenheit-personal', p);
export const zeitkontoLaden = async (): Promise<ZeitkontoDaten> => zeitkontoPruefen(await store().get('abwesenheit-zeitkonto', { type: 'json' }));
export const zeitkontoSpeichern = (d: ZeitkontoDaten) => store().setJSON('abwesenheit-zeitkonto', d);
const archivSchluessel = (b: Pick<BerichtArchiv, 'monat' | 'id'>) => `abwesenheit-bericht/${b.monat}/${b.id}`;
export async function berichtArchivLaden(): Promise<BerichtArchiv[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: 'abwesenheit-bericht/' });
  const l = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<BerichtArchiv | null>));
  return l.filter((b): b is BerichtArchiv => !!b).sort((a, b) => b.monat.localeCompare(a.monat) || b.erstellt - a.erstellt);
}
export const berichtArchivSpeichern = (b: BerichtArchiv) => store().setJSON(archivSchluessel(b), b);
export const berichtArchivLoeschen = (b: Pick<BerichtArchiv, 'monat' | 'id'>) => store().delete(archivSchluessel(b));

/* Telefondienst: ein Blob je Mitschrift, Aufnahmen getrennt. */
const telSchluessel = (id: string) => `telefon/eintrag/${id}`;
export async function mitschriftenLaden(): Promise<Mitschrift[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: 'telefon/eintrag/' });
  const l = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<Mitschrift | null>));
  return l.filter((m): m is Mitschrift => !!m?.id).sort((a, b) => b.zeit - a.zeit);
}
export const mitschriftSpeichern = (m: Mitschrift) => store().setJSON(telSchluessel(m.id), m);
export const mitschriftLoeschen = (id: string) => store().delete(telSchluessel(id));
const aufnahmeSchluessel = (id: string) => `telefon/aufnahme/${id}`;
export const aufnahmeSpeichern = (id: string, daten: ArrayBuffer, typ: string) => store().set(aufnahmeSchluessel(id), daten, { metadata: { typ } });
export const aufnahmeLaden = (id: string) => store().get(aufnahmeSchluessel(id), { type: 'arrayBuffer' });
export const aufnahmeLoeschen = (id: string) => store().delete(aufnahmeSchluessel(id));

/* Personalplanung: ein Blob je Termin. */
const einteilungSchluessel = (termin: string) => `einteilung/${Buffer.from(termin).toString('base64url')}`;

export async function einteilungenLaden(): Promise<Einteilung[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: 'einteilung/' });
  const l = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<Einteilung | null>));
  return l.filter((e): e is Einteilung => !!e?.termin && Array.isArray(e.personen));
}

export const einteilungSpeichern = (e: Einteilung) => store().setJSON(einteilungSchluessel(e.termin), e);
export const einteilungLoeschen = (termin: string) => store().delete(einteilungSchluessel(termin));

/** Sitzung aus dem Cookie oder – eingebettet im Hub, wo fremde Cookies blockiert werden – aus „Authorization: Bearer“. */
export async function angemeldet(req: Request): Promise<{ sitzung: Sitzung; rechte: Rechte; konfig: Konfiguration } | null> {
  const bearer = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  const sitzung = sitzungPruefen(bearer ?? cookies(req)[SESSION_COOKIE]);
  if (!sitzung) return null;
  const konfig = await konfigLaden();
  return { sitzung, konfig, rechte: rechteFuerSitzung(sitzung, konfig) };
}

/* ── Anmeldung über den Bestattung Stranz HUB ── */

/** Wie angemeldet(), zusätzlich Server-zu-Server-Abruf des Hubs mit Ticket im Header „x-hub-ticket“ (z. B. /api/heute). */
export async function angemeldetOderHub(req: Request): Promise<{ sitzung: Sitzung; rechte: Rechte; konfig: Konfiguration } | null> {
  const ticket = req.headers.get('x-hub-ticket');
  if (!ticket) return angemeldet(req);
  const person = hubTicketPruefen(ticket, new URL(req.url).origin);
  if (!person) return null;
  const konfig = await konfigLaden();
  const { sitzungBis: _bis, ...rest } = person;
  return { sitzung: { ...rest, exp: Date.now() + 60_000 }, konfig, rechte: rechteFuerSitzung(rest, konfig) };
}

/**
 * Prüft ein Hub-Ticket (Ed25519, 60 s gültig, an diese App gebunden).
 * HUB_SSO_PUBLIC_KEY = öffentlicher Schlüssel des Hubs (https://bestattung-stranz-hub.netlify.app/api/sso/schluessel).
 */
export function hubTicketPruefen(ticket: string, origin: string, jetzt = Date.now()): (Omit<Sitzung, 'exp'> & { sitzungBis?: number }) | null {
  const pem = env('HUB_SSO_PUBLIC_KEY').replace(/\\n/g, '\n');
  if (!pem.includes('PUBLIC KEY')) throw new Error('HUB_SSO_PUBLIC_KEY fehlt');
  const [daten, sig] = ticket.split('.');
  if (!daten || !sig) return null;
  if (!verify(null, Buffer.from(daten), createPublicKey(pem), Buffer.from(sig, 'base64url'))) return null;
  const p = JSON.parse(Buffer.from(daten, 'base64url').toString()) as {
    iss?: string;
    aud?: string;
    email?: string;
    name?: string;
    bild?: string;
    exp?: number;
    kiosk?: boolean;
    sitzungBis?: number;
  };
  if (p.iss !== 'bestattung-stranz-hub' || p.aud !== origin || typeof p.email !== 'string' || !p.email.includes('@')) return null;
  if (typeof p.exp !== 'number' || p.exp <= jetzt) return null;
  const person = { email: p.email.toLowerCase(), name: p.name, bild: p.bild };
  return p.kiosk === true ? { ...person, kiosk: true, sitzungBis: typeof p.sitzungBis === 'number' ? p.sitzungBis : jetzt + 5 * 60_000 } : person;
}

/* ── Service Account ── */

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const LESEN = 'https://www.googleapis.com/auth/calendar.readonly';
const SCHREIBEN = 'https://www.googleapis.com/auth/calendar.events';
const saTokens = new Map<string, { token: string; bis: number }>();

export function serviceAccount(): ServiceAccount {
  let roh = env('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!roh) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON fehlt');
  if (!roh.trim().startsWith('{')) roh = Buffer.from(roh, 'base64').toString();
  return JSON.parse(roh) as ServiceAccount;
}

export async function serviceAccountToken(scope = LESEN): Promise<string> {
  const saToken = saTokens.get(scope);
  if (saToken && saToken.bis > Date.now() + 60_000) return saToken.token;
  const sa = serviceAccount();
  const jetzt = Math.floor(Date.now() / 1000);
  const kopf = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const inhalt = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: jetzt,
      exp: jetzt + 3600,
    }),
  );
  const sig = createSign('RSA-SHA256').update(`${kopf}.${inhalt}`).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${kopf}.${inhalt}.${sig}` }),
  });
  if (!res.ok) throw new Error(`Service Account: ${res.status} ${await res.text()}`);
  const r = (await res.json()) as { access_token: string; expires_in: number };
  saTokens.set(scope, { token: r.access_token, bis: Date.now() + r.expires_in * 1000 });
  return r.access_token;
}

export async function googleGet<T>(pfad: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://www.googleapis.com/calendar/v3${pfad}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { authorization: `Bearer ${await serviceAccountToken()}` } });
  if (!res.ok) throw new Error(`Google Kalender ${pfad}: ${res.status}`);
  return (await res.json()) as T;
}

/** Schreibender Zugriff (Termine anlegen/löschen) – der Service Account braucht im Kalender „Änderungen an Terminen vornehmen“. */
export async function googleSenden<T = unknown>(methode: 'POST' | 'PUT' | 'PATCH' | 'DELETE', pfad: string, daten?: unknown): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${pfad}`, {
    method: methode,
    headers: { authorization: `Bearer ${await serviceAccountToken(SCHREIBEN)}`, ...(daten ? { 'content-type': 'application/json' } : {}) },
    ...(daten ? { body: JSON.stringify(daten) } : {}),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

/* ── E-Mail-Änderung aus dem Hub: alle Daten mit Personenbezug übernehmen (Berichtsarchiv bleibt als fester Stand) ── */
const UMZUG_SCHLUESSEL = ['konfiguration', 'hub-verzeichnis', 'abwesenheit-personal', 'abwesenheit-zeitkonto', 'telefonplan/muster'];
const UMZUG_PRAEFIXE = ['abwesenheit/eintrag/', 'bereitschaft/', 'telefonplan/eintrag/', 'telefon/eintrag/', 'einteilung/'];

export async function emailUmziehen(alt: string, neu: string): Promise<number> {
  const s = store();
  const listen = await Promise.all(UMZUG_PRAEFIXE.map((prefix) => s.list({ prefix })));
  const schluessel = [...UMZUG_SCHLUESSEL, ...listen.flatMap((l) => l.blobs.map((b) => b.key))];
  let anzahl = 0;
  for (let i = 0; i < schluessel.length; i += 20) {
    const teil = await Promise.all(
      schluessel.slice(i, i + 20).map(async (key) => {
        const vorher = (await s.get(key, { type: 'json' }).catch(() => null)) as unknown;
        if (vorher == null) return 0;
        const { wert, geaendert } = emailErsetzen(vorher, alt, neu);
        if (!geaendert) return 0;
        await s.setJSON(key, wert);
        return 1;
      }),
    );
    anzahl += teil.reduce<number>((x, y) => x + y, 0);
  }
  verzeichnisCache = null;
  return anzahl;
}
