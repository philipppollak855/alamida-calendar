import { createHmac, createSign, randomBytes, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { STANDARD_KONFIG, konfigPruefen, rechteFuer, type Konfiguration, type Rechte } from '../../src/shared/rechte';

export const SESSION_COOKIE = 'alamida_session';
export const SESSION_TAGE = 90;

export function env(name: string): string {
  return (globalThis as { Netlify?: { env: { get(n: string): string | undefined } } }).Netlify?.env.get(name) ?? process.env[name] ?? '';
}

export const clientId = () => env('GOOGLE_CLIENT_ID') || env('VITE_GOOGLE_CLIENT_ID');
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

export async function konfigSpeichern(k: Konfiguration): Promise<void> {
  await store().setJSON('konfiguration', k);
}

export async function angemeldet(req: Request): Promise<{ sitzung: Sitzung; rechte: Rechte; konfig: Konfiguration } | null> {
  const sitzung = sitzungPruefen(cookies(req)[SESSION_COOKIE]);
  if (!sitzung) return null;
  const konfig = await konfigLaden();
  return { sitzung, konfig, rechte: rechteFuer(sitzung.email, konfig, adminEmails()) };
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
