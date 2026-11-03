import { createHmac, createPublicKey, createSign, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { STANDARD_KONFIG, konfigPruefen, rechteFuer, type Konfiguration, type Rechte } from '../../src/shared/rechte';
import type { Einsatz } from '../../src/shared/bereitschaft';
import { personalPruefen, type Abwesenheit, type Personal } from '../../src/shared/abwesenheit';
import type { AgentStatus } from './agent';

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

export async function konfigLaden(): Promise<Konfiguration> {
  const k = (await store().get('konfiguration', { type: 'json' })) as unknown;
  return k ? konfigPruefen(k) : STANDARD_KONFIG;
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

/* Urlaub / Krank: ein Blob je Abwesenheit, Personal-Stammdaten als ein Blob. */
const abwSchluessel = (id: string) => `abwesenheit/eintrag/${id}`;

export async function abwesenheitenLaden(): Promise<Abwesenheit[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: 'abwesenheit/eintrag/' });
  const l = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<Abwesenheit | null>));
  return l.filter((e): e is Abwesenheit => !!e).sort((a, b) => a.von.localeCompare(b.von));
}

export const abwesenheitSpeichern = (e: Abwesenheit) => store().setJSON(abwSchluessel(e.id), e);
export const abwesenheitLoeschen = (e: Pick<Abwesenheit, 'id'>) => store().delete(abwSchluessel(e.id));
export const personalLaden = async (): Promise<Personal[]> => personalPruefen(await store().get('abwesenheit-personal', { type: 'json' }));
export const personalSpeichern = (p: Personal[]) => store().setJSON('abwesenheit-personal', p);

/** Sitzung aus dem Cookie oder – eingebettet im Hub, wo fremde Cookies blockiert werden – aus „Authorization: Bearer“. */
export async function angemeldet(req: Request): Promise<{ sitzung: Sitzung; rechte: Rechte; konfig: Konfiguration } | null> {
  const bearer = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  const sitzung = sitzungPruefen(bearer ?? cookies(req)[SESSION_COOKIE]);
  if (!sitzung) return null;
  const konfig = await konfigLaden();
  return { sitzung, konfig, rechte: rechteFuer(sitzung.email, konfig, adminEmails()) };
}

/* ── Anmeldung über den Bestattung Stranz HUB ── */

/** Wie angemeldet(), zusätzlich Server-zu-Server-Abruf des Hubs mit Ticket im Header „x-hub-ticket“ (z. B. /api/heute). */
export async function angemeldetOderHub(req: Request): Promise<{ sitzung: Sitzung; rechte: Rechte; konfig: Konfiguration } | null> {
  const ticket = req.headers.get('x-hub-ticket');
  if (!ticket) return angemeldet(req);
  const person = hubTicketPruefen(ticket, new URL(req.url).origin);
  if (!person) return null;
  const konfig = await konfigLaden();
  return { sitzung: { ...person, exp: Date.now() + 60_000 }, konfig, rechte: rechteFuer(person.email, konfig, adminEmails()) };
}

/**
 * Prüft ein Hub-Ticket (Ed25519, 60 s gültig, an diese App gebunden).
 * HUB_SSO_PUBLIC_KEY = öffentlicher Schlüssel des Hubs (https://bestattung-stranz-hub.netlify.app/api/sso/schluessel).
 */
export function hubTicketPruefen(ticket: string, origin: string, jetzt = Date.now()): Omit<Sitzung, 'exp'> | null {
  const pem = env('HUB_SSO_PUBLIC_KEY').replace(/\\n/g, '\n');
  if (!pem.includes('PUBLIC KEY')) throw new Error('HUB_SSO_PUBLIC_KEY fehlt');
  const [daten, sig] = ticket.split('.');
  if (!daten || !sig) return null;
  if (!verify(null, Buffer.from(daten), createPublicKey(pem), Buffer.from(sig, 'base64url'))) return null;
  const p = JSON.parse(Buffer.from(daten, 'base64url').toString()) as { iss?: string; aud?: string; email?: string; name?: string; bild?: string; exp?: number };
  if (p.iss !== 'bestattung-stranz-hub' || p.aud !== origin || typeof p.email !== 'string' || !p.email.includes('@')) return null;
  if (typeof p.exp !== 'number' || p.exp <= jetzt) return null;
  return { email: p.email.toLowerCase(), name: p.name, bild: p.bild };
}

/* ── Service Account ── */

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let saToken: { token: string; bis: number } | null = null;

export function serviceAccount(): ServiceAccount {
  let roh = env('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!roh) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON fehlt');
  if (!roh.trim().startsWith('{')) roh = Buffer.from(roh, 'base64').toString();
  return JSON.parse(roh) as ServiceAccount;
}

export async function serviceAccountToken(): Promise<string> {
  if (saToken && saToken.bis > Date.now() + 60_000) return saToken.token;
  const sa = serviceAccount();
  const jetzt = Math.floor(Date.now() / 1000);
  const kopf = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const inhalt = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
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
  saToken = { token: r.access_token, bis: Date.now() + r.expires_in * 1000 };
  return r.access_token;
}

export async function googleGet<T>(pfad: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://www.googleapis.com/calendar/v3${pfad}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { authorization: `Bearer ${await serviceAccountToken()}` } });
  if (!res.ok) throw new Error(`Google Kalender ${pfad}: ${res.status}`);
  return (await res.json()) as T;
}
