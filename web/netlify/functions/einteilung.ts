import type { Config } from '@netlify/functions';
import { ablaufId, darfEinteilen, einteilungFehler, terminTeile, type EinteilungPerson } from '../../src/shared/einteilung';
import { darfKalender, darfSehen } from '../../src/shared/rechte';
import { kategorieAus, type GoogleEvent } from '../../src/planung/planungLogic';
import { angemeldet, einteilungLoeschen, einteilungSpeichern, einteilungenLaden, googleGet, json } from '../lib/server';

/** Personalplanung: GET alle Einteilungen, PUT { termin, personen: E-Mails[] } bzw. { fall, tag, personen } für den
 * ganzen Ablauf eines Falls an einem Tag – nur für Befähigte. Leere Liste = Einteilung entfernen. */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'kein Zugriff' }, 403);
  const darf = darfEinteilen(a.rechte, a.konfig);
  const benutzer = new Map(a.konfig.benutzer.map((b) => [b.email.toLowerCase(), b.name]));

  if (req.method === 'PUT') {
    if (!darf) return json({ fehler: 'Keine Berechtigung für die Personalplanung' }, 403);
    const b = (await req.json().catch(() => ({}))) as { termin?: unknown; personen?: unknown; fall?: unknown; tag?: unknown };
    const liste = (Array.isArray(b.personen) ? b.personen : []).filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase());
    const mitNamen = (emails: string[]): EinteilungPerson[] => emails.map((email) => ({ email, ...(benutzer.get(email) ? { name: benutzer.get(email) } : {}) }));
    if (b.fall !== undefined) {
      if (typeof b.fall !== 'string' || !b.fall.trim() || b.fall.length > 200) return json({ fehler: 'Fall fehlt' }, 400);
      if (typeof b.tag !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.tag)) return json({ fehler: 'Tag fehlt' }, 400);
      const fehler = einteilungFehler('Beisetzung', liste, new Set(benutzer.keys()));
      if (fehler) return json({ fehler }, 400);
      const termin = ablaufId(b.fall, b.tag);
      const personen = mitNamen(liste);
      if (personen.length) await einteilungSpeichern({ termin, personen, geaendert: Date.now(), von: a.sitzung.email.toLowerCase() });
      else await einteilungLoeschen(termin);
      return json({ termin, personen });
    }
    const teile = typeof b.termin === 'string' ? terminTeile(b.termin) : null;
    if (!teile) return json({ fehler: 'Termin fehlt' }, 400);
    if (!darfKalender(a.rechte, teile.kalenderId)) return json({ fehler: 'Kein Zugriff auf diesen Kalender' }, 403);
    let event: GoogleEvent;
    try {
      event = await googleGet<GoogleEvent>(`/calendars/${encodeURIComponent(teile.kalenderId)}/events/${encodeURIComponent(teile.eventId)}`);
    } catch {
      return json({ fehler: 'Termin nicht gefunden' }, 404);
    }
    const kategorie = kategorieAus(event);
    if (event.status === 'cancelled') return json({ fehler: 'Termin wurde abgesagt' }, 404);
    if (!darfSehen(a.rechte, teile.kalenderId, kategorie)) return json({ fehler: 'Kein Zugriff auf diesen Termin' }, 403);
    const emails = liste;
    const fehler = einteilungFehler(kategorie, emails, new Set(benutzer.keys()));
    if (fehler) return json({ fehler }, 400);
    const termin = `${teile.kalenderId}/${teile.eventId}`;
    const personen = mitNamen(emails);
    if (personen.length) await einteilungSpeichern({ termin, personen, geaendert: Date.now(), von: a.sitzung.email.toLowerCase() });
    else await einteilungLoeschen(termin);
    return json({ termin, personen });
  }

  const alle = await einteilungenLaden();
  return json({
    // Namen aus dem aktuellen Verzeichnis (falls im Hub umbenannt).
    einteilungen: alle.map((e) => ({ termin: e.termin, personen: e.personen.map((p) => ({ ...p, name: benutzer.get(p.email) ?? p.name })) })),
    darfEinteilen: darf,
    personen: darf ? a.konfig.benutzer.map((x) => ({ email: x.email.toLowerCase(), name: x.name, ...(x.extern ? { extern: true } : {}) })) : [],
  });
};

export const config: Config = { path: '/api/einteilung', method: ['GET', 'PUT'] };
