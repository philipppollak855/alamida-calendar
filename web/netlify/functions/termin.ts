import type { Config } from '@netlify/functions';
import { KATEGORIE_SCHLUESSEL, darfSehen } from '../../src/shared/rechte';
import { WEB_QUELLE, darfAnlegen, googleEreignis, neuerTerminPruefen, zielKalender } from '../../src/shared/neuerTermin';
import { terminTeile } from '../../src/shared/einteilung';
import { KATEGORIEN, kategorieAus, type GoogleEvent } from '../../src/planung/planungLogic';
import { angemeldet, einteilungLoeschen, googleGet, googleSenden, json } from '../lib/server';

/** POST: neuen Termin anlegen (Befähigte). DELETE ?id=kalenderId/eventId: in der App angelegten Termin löschen (Ersteller oder Admin). */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'kein Zugriff' }, 403);
  const ich = a.sitzung.email.toLowerCase();

  if (req.method === 'DELETE') {
    const teile = terminTeile(new URL(req.url).searchParams.get('id') ?? '');
    if (!teile) return json({ fehler: 'Termin fehlt' }, 400);
    const pfad = `/calendars/${encodeURIComponent(teile.kalenderId)}/events/${encodeURIComponent(teile.eventId)}`;
    let ev: GoogleEvent;
    try {
      ev = await googleGet<GoogleEvent>(pfad);
    } catch {
      return json({ fehler: 'Termin nicht gefunden' }, 404);
    }
    const p = ev.extendedProperties?.private ?? {};
    if (!darfSehen(a.rechte, teile.kalenderId, kategorieAus(ev))) return json({ fehler: 'Kein Zugriff' }, 403);
    if (p.quelle !== WEB_QUELLE) return json({ fehler: 'Nur in der App angelegte Termine können hier gelöscht werden' }, 403);
    if (p.angelegtVon !== ich && !a.rechte.admin) return json({ fehler: 'Nur wer den Termin angelegt hat oder ein Admin darf ihn löschen' }, 403);
    await googleSenden('DELETE', pfad);
    await einteilungLoeschen(`${teile.kalenderId}/${teile.eventId}`).catch(() => undefined);
    return json({ ok: true });
  }

  if (!darfAnlegen(a.rechte, a.konfig)) return json({ fehler: 'Keine Berechtigung zum Anlegen von Terminen' }, 403);
  const p = neuerTerminPruefen(await req.json().catch(() => ({})), KATEGORIE_SCHLUESSEL);
  if ('fehler' in p) return json({ fehler: p.fehler }, 400);
  const t = p.termin;
  const kalenderId = zielKalender(a.konfig, t.kategorie);
  if (!kalenderId) return json({ fehler: 'Kein Kalender eingestellt (Rechte → Kalender)' }, 400);
  if (!darfSehen(a.rechte, kalenderId, t.kategorie)) return json({ fehler: 'Keine Berechtigung für diese Kategorie bzw. diesen Kalender' }, 403);
  const k = KATEGORIEN[t.kategorie as keyof typeof KATEGORIEN];
  try {
    const event = await googleSenden<GoogleEvent>('POST', `/calendars/${encodeURIComponent(kalenderId)}/events`, googleEreignis(t, k, { email: ich, name: a.sitzung.name }));
    return json({ kalender: { id: kalenderId, name: a.konfig.kalender.find((x) => x.id === kalenderId)?.name ?? kalenderId }, event });
  } catch (e) {
    return json({ fehler: `Google Kalender: ${(e as Error).message}` }, 502);
  }
};

export const config: Config = { path: '/api/termin', method: ['POST', 'DELETE'] };
