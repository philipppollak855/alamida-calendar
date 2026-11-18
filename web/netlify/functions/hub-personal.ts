import type { Config } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { personalPruefen } from '../../src/shared/abwesenheit';
import { emailUmziehen, env, json, personalLaden, personalSpeichern } from '../lib/server';

const norm = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

/**
 * Personal-Stammdaten für die Mitarbeiterverwaltung im Hub (eine Grundlage für Rechte und Personal).
 * Nur Server zu Server mit „Authorization: Bearer <HUB_VERZEICHNIS_SCHLUESSEL>“.
 * GET: alle Stammdaten · PUT { personal, vorher? }: einen Mitarbeiter anlegen/ändern (anderes Konto → alle Daten ziehen mit) · DELETE ?email=
 */
export default async (req: Request) => {
  const soll = env('HUB_VERZEICHNIS_SCHLUESSEL');
  const ist = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  if (!soll || ist.length !== soll.length || !timingSafeEqual(Buffer.from(ist), Buffer.from(soll))) return json({ fehler: 'nicht berechtigt' }, 401);
  let personal = await personalLaden();
  if (req.method === 'GET') return json({ personal });
  if (req.method === 'DELETE') {
    const email = norm(new URL(req.url).searchParams.get('email'));
    personal = personal.filter((p) => p.email !== email);
    await personalSpeichern(personal);
    return json({ personal });
  }
  const b = (await req.json().catch(() => ({}))) as { personal?: unknown; vorher?: unknown };
  const [p] = personalPruefen([b.personal]);
  if (!p) return json({ fehler: 'Stammdaten unvollständig (Konto fehlt)' }, 400);
  const vorher = norm(b.vorher) || p.email;
  if (vorher !== p.email) {
    // Nur ablehnen, wenn beide Konten noch Personaldaten haben; fehlt das alte schon, war ein früherer Umzug unterbrochen und wird fortgesetzt.
    if (personal.some((x) => x.email === p.email) && personal.some((x) => x.email === vorher)) return json({ fehler: 'Für dieses Konto gibt es schon Personaldaten' }, 409);
    await emailUmziehen(vorher, p.email);
    personal = await personalLaden();
  }
  // Der Hub kennt die erweiterte Akte nicht: fehlt sie, bleibt die gespeicherte erhalten.
  personal = personal.some((x) => x.email === p.email) ? personal.map((x) => (x.email === p.email ? { ...p, akte: p.akte ?? x.akte } : x)) : [...personal, p];
  await personalSpeichern(personal);
  return json({ personal });
};

export const config: Config = { path: '/api/hub-personal', method: ['GET', 'PUT', 'DELETE'] };
