import type { Config } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import { darfPlanen, datumText, einsatzFehler, plusTage, type Einsatz } from '../../src/shared/bereitschaft';
import { hatRolle, mitRolle, rolleVergeben } from '../../src/shared/rollen';
import { angemeldet, bereitschaftLaden, einsatzLoeschen, einsatzSpeichern, json } from '../lib/server';

/** Bereitschaft: GET Liste, POST eintragen, DELETE ?id= austragen. Jeder trägt sich selbst ein, Planer/Admins alle. */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'keine Freigabe' }, 403);
  const planer = darfPlanen(a.rechte, a.konfig);
  const ich = a.sitzung.email.toLowerCase();
  const rollen = a.konfig.benutzer.map((b) => ({ email: b.email.toLowerCase(), rollen: b.rollen }));
  const rolleAktiv = rolleVergeben(rollen, 'bereitschaft');
  // Standard: ab 31 Tagen zurück; mit ?von=JJJJ-MM-TT (Kalender, Jahresübersicht) bis zu gut 2 Jahre zurück.
  const standardAb = datumText(plusTage(new Date(), -31));
  const vonParam = new URL(req.url).searchParams.get('von') ?? '';
  const ab = /^\d{4}-\d{2}-\d{2}$/.test(vonParam) && vonParam < standardAb ? (vonParam > datumText(plusTage(new Date(), -800)) ? vonParam : datumText(plusTage(new Date(), -800))) : standardAb;
  let liste = await bereitschaftLaden(ab);

  if (req.method === 'POST') {
    const b = (await req.json().catch(() => ({}))) as { email?: unknown; von?: unknown; bis?: unknown };
    const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim().toLowerCase() : ich;
    if (email !== ich && !planer) return json({ fehler: 'Du darfst nur dich selbst eintragen' }, 403);
    const person = a.konfig.benutzer.find((x) => x.email === email);
    if (email !== ich && !person) return json({ fehler: 'Unbekannter Mitarbeiter' }, 400);
    const neu = { email, von: String(b.von ?? ''), bis: String(b.bis ?? '') };
    const fehler = einsatzFehler(liste, neu, rollen);
    if (fehler) return json({ fehler }, 400);
    const name = person?.name ?? (email === ich ? a.sitzung.name : undefined);
    const e: Einsatz = { id: randomBytes(9).toString('base64url'), ...neu, ...(name ? { name } : {}), eingetragenVon: ich, erstellt: Date.now() };
    await einsatzSpeichern(e);
    // Gleichzeitige Anfragen: nach dem Speichern gegen alle anderen Einträge erneut prüfen und bei Konflikt den eigenen
    // zurücknehmen. Im ungünstigsten Fall werden beide abgelehnt, aber nie mehr als erlaubt eingetragen.
    liste = await bereitschaftLaden(ab);
    const konflikt = einsatzFehler(liste.filter((x) => x.id !== e.id), neu, rollen);
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
    personen: planer ? mitRolle(a.konfig.benutzer, 'bereitschaft').map((x) => ({ email: x.email, name: x.name })) : [],
    dritter: a.konfig.benutzer.filter((x) => x.dritterNoetig).map((x) => x.email.toLowerCase()),
    darfEintragen: !rolleAktiv || hatRolle(rollen.find((x) => x.email === ich), 'bereitschaft'),
  });
};

export const config: Config = { path: '/api/bereitschaft', method: ['GET', 'POST', 'DELETE'] };
