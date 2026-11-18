import type { Config } from '@netlify/functions';
import { darfSehen } from '../../src/shared/rechte';
import { checklisteAus, terminSichtbar } from '../../src/shared/neuerTermin';
import { terminTeile } from '../../src/shared/einteilung';
import { kategorieAus, type GoogleEvent } from '../../src/planung/planungLogic';
import { angemeldet, googleGet, json, store } from '../lib/server';

type Stand = Record<string, { von: string; zeit: string }>;
const schluessel = (id: string) => `checkliste/${Buffer.from(id).toString('base64url')}`;

/** Abhak-Stand der Checkliste je Termin (bei Serien je einzelnem Termin). GET ?id=… · PUT { id, punkt, erledigt } */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'kein Zugriff' }, 403);
  const body = req.method === 'PUT' ? ((await req.json().catch(() => ({}))) as { id?: string; punkt?: string; erledigt?: boolean }) : {};
  const id = req.method === 'PUT' ? String(body.id ?? '') : (new URL(req.url).searchParams.get('id') ?? '');
  const teile = terminTeile(id);
  if (!teile) return json({ fehler: 'Termin fehlt' }, 400);
  let ev: GoogleEvent;
  try {
    ev = await googleGet<GoogleEvent>(`/calendars/${encodeURIComponent(teile.kalenderId)}/events/${encodeURIComponent(teile.eventId)}`);
  } catch {
    return json({ fehler: 'Termin nicht gefunden' }, 404);
  }
  const p = ev.extendedProperties?.private;
  if (!darfSehen(a.rechte, teile.kalenderId, kategorieAus(ev)) || !terminSichtbar(a.rechte, p)) return json({ fehler: 'Kein Zugriff' }, 403);
  const s = store();
  const stand = ((await s.get(schluessel(id), { type: 'json' })) as Stand | null) ?? {};
  if (req.method !== 'PUT') return json({ erledigt: stand });
  const punkt = String(body.punkt ?? '');
  if (!checklisteAus(p).includes(punkt)) return json({ fehler: 'Unbekannter Punkt' }, 400);
  if (body.erledigt) stand[punkt] = { von: a.sitzung.name || a.sitzung.email, zeit: new Date().toISOString() };
  else delete stand[punkt];
  await s.setJSON(schluessel(id), stand);
  return json({ erledigt: stand });
};

export const config: Config = { path: '/api/checkliste', method: ['GET', 'PUT'] };
