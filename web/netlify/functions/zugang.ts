import type { Config } from '@netlify/functions';
import { HUB_URL, angemeldet, env, json, verzeichnisVergessen } from '../lib/server';

/** Zugang & Rechte (Gruppen, Rollen, Admin, PIN, Sichtbarkeit) aus der Personalakte im Hub speichern – nur Admins. */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a?.rechte.admin) return json({ fehler: 'nur für Administratoren' }, 403);
  const schluessel = env('HUB_VERZEICHNIS_SCHLUESSEL');
  if (!schluessel) return json({ fehler: 'Hub-Verbindung fehlt (HUB_VERZEICHNIS_SCHLUESSEL)' }, 500);
  const headers = { authorization: `Bearer ${schluessel}`, 'content-type': 'application/json' };
  const put = req.method === 'PUT';
  const ziel = put ? `${HUB_URL()}/api/zugang` : `${HUB_URL()}/api/zugang?email=${encodeURIComponent(new URL(req.url).searchParams.get('email') ?? '')}`;
  const body = put ? JSON.stringify({ ...((await req.json().catch(() => ({}))) as object), durch: a.sitzung.email }) : undefined;
  const res = await fetch(ziel, { method: req.method, headers, body, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res) return json({ fehler: 'Hub nicht erreichbar' }, 502);
  if (put && res.ok) verzeichnisVergessen();
  return json(await res.json().catch(() => ({ fehler: `Hub: Fehler ${res.status}` })), res.status);
};

export const config: Config = { path: '/api/zugang', method: ['GET', 'PUT'] };
