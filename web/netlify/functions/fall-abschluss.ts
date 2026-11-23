import type { Config } from '@netlify/functions';
import { darfFaelleAbschliessen } from '../../src/shared/rechte';
import { angemeldet, json, store } from '../lib/server';

type Abschluss = { fall: string; von: string; zeit: string };
const PRAEFIX = 'fall-abschluss/';
const schluessel = (fall: string) => PRAEFIX + Buffer.from(fall).toString('base64url');

/** Manuell abgeschlossene Sterbefälle. GET → { abgeschlossen } · PUT { fall, abgeschlossen } (Admin/Büro). */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'kein Zugriff' }, 403);
  const s = store();
  const darf = darfFaelleAbschliessen(a.rechte, a.konfig);
  if (req.method === 'PUT') {
    if (!darf) return json({ fehler: 'Nur Admin oder Büro dürfen Fälle abschließen' }, 403);
    const body = (await req.json().catch(() => ({}))) as { fall?: unknown; abgeschlossen?: unknown };
    const fall = typeof body.fall === 'string' ? body.fall.trim() : '';
    if (!fall || fall.length > 100) return json({ fehler: 'Fall fehlt' }, 400);
    if (body.abgeschlossen) await s.setJSON(schluessel(fall), { fall, von: a.sitzung.name || a.sitzung.email, zeit: new Date().toISOString() } satisfies Abschluss);
    else await s.delete(schluessel(fall));
  }
  const { blobs } = await s.list({ prefix: PRAEFIX });
  const liste = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<Abschluss | null>));
  // Wer nicht abschließen darf, erfährt nur, welche Fälle abgeschlossen sind (nicht wer und wann).
  return json({ abgeschlossen: Object.fromEntries(liste.filter((x): x is Abschluss => !!x).map((x) => [x.fall, darf ? { von: x.von, zeit: x.zeit } : { von: '', zeit: '' }])) });
};

export const config: Config = { path: '/api/fall-abschluss', method: ['GET', 'PUT'] };
