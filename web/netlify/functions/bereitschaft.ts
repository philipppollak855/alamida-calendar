import type { Config } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import { darfPlanen, datumText, einsatzFehler, plusTage, type Einsatz } from '../../src/shared/bereitschaft';
import { angemeldet, bereitschaftLaden, einsatzLoeschen, einsatzSpeichern, json } from '../lib/server';

/** Bereitschaft: GET Liste, POST eintragen, DELETE ?id= austragen. Jeder trägt sich selbst ein, Planer/Admins alle. */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'keine Freigabe' }, 403);
  const planer = darfPlanen(a.rechte, a.konfig);
  const ich = a.sitzung.email.toLowerCase();
  const ab = datumText(plusTage(new Date(), -31));
  let liste = await bereitschaftLaden(ab);

  if (req.method === 'POST') {
    const b = (await req.json().catch(() => ({}))) as { email?: unknown; von?: unknown; bis?: unknown };
    const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim().toLowerCase() : ich;
    if (email !== ich && !planer) return json({ fehler: 'Du darfst nur dich selbst eintragen' }, 403);
    const person = a.konfig.benutzer.find((x) => x.email === email);
    if (email !== ich && !person) return json({ fehler: 'Unbekannter Mitarbeiter' }, 400);
    const neu = { email, von: String(b.von ?? ''), bis: String(b.bis ?? '') };
    const fehler = einsatzFehler(liste, neu);
    if (fehler) return json({ fehler }, 400);
    const name = person?.name ?? (email === ich ? a.sitzung.name : undefined);
    const e: Einsatz = { id: randomBytes(9).toString('base64url'), ...neu, ...(name ? { name } : {}), eingetragenVon: ich, erstellt: Date.now() };
    await einsatzSpeichern(e);
    // Gleichzeitige Anfragen: nach dem Speichern gegen alle anderen Einträge erneut prüfen und bei Konflikt den eigenen
    // zurücknehmen. Im ungünstigsten Fall werden beide abgelehnt, aber nie mehr als erlaubt eingetragen.
    liste = await bereitschaftLaden(ab);
    const konflikt = einsatzFehler(liste.filter((x) => x.id !== e.id), neu);
    if (konflikt) {
      await einsatzLoeschen(e);
      return json({ fehler: konflikt }, 409);
    }
  } else if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    const e = liste.find((x) => x.id === id);
    if (!e) return json({ fehler: 'Eintrag nicht gefunden' }, 404);
    if (e.email !== ich && !planer) return json({ fehler: 'Du darfst nur dich selbst austragen' }, 403);
    await einsatzLoeschen(e);
    liste = liste.filter((x) => x.id !== id);
  }

  return json({
    eintraege: liste.map(({ eingetragenVon, erstellt: _e, ...rest }) => (planer ? { ...rest, eingetragenVon } : rest)),
    darfPlanen: planer,
    ich: { email: ich, name: a.sitzung.name },
    personen: planer ? a.konfig.benutzer.map((x) => ({ email: x.email, name: x.name })) : [],
  });
};

export const config: Config = { path: '/api/bereitschaft', method: ['GET', 'POST', 'DELETE'] };
