import type { Config } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { emailGueltig } from '../../src/shared/emailUmzug';
import { emailUmziehen, env, json } from '../lib/server';

/** Vom Hub aufgerufen, wenn sich die E-Mail eines Mitarbeiters ändert (Server zu Server mit Bearer HUB_VERZEICHNIS_SCHLUESSEL). */
export default async (req: Request) => {
  const soll = env('HUB_VERZEICHNIS_SCHLUESSEL');
  const ist = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  if (!soll || ist.length !== soll.length || !timingSafeEqual(Buffer.from(ist), Buffer.from(soll))) return json({ fehler: 'nicht berechtigt' }, 401);
  const b = (await req.json().catch(() => ({}))) as { alt?: unknown; neu?: unknown };
  const alt = typeof b.alt === 'string' ? b.alt.trim().toLowerCase() : '';
  const neu = typeof b.neu === 'string' ? b.neu.trim().toLowerCase() : '';
  if (!emailGueltig(alt) && !alt.includes('@')) return json({ fehler: 'alte Adresse fehlt' }, 400);
  if (!emailGueltig(neu) || alt === neu) return json({ fehler: 'ungültige neue Adresse' }, 400);
  return json({ anzahl: await emailUmziehen(alt, neu) });
};

export const config: Config = { path: '/api/email-umzug', method: ['POST'] };
