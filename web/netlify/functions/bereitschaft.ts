import type { Config } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import { darfPlanen, datumText, einsaetzeIn, einsatzFehler, plusTage, zusatztagFehler, type Einsatz } from '../../src/shared/bereitschaft';
import { hatRolle, mitRolle, rolleVergeben } from '../../src/shared/rollen';
import { sichtFuer } from '../../src/shared/rechte';
import { darfTelefonplan } from '../../src/shared/telefonplan';
import { angemeldet, bereitschaftLaden, einsatzLoeschen, einsatzSpeichern, json, zusatztagLoeschen, zusatztageLaden, zusatztagSpeichern } from '../lib/server';

/**
 * Bereitschaft: GET Liste, POST eintragen, DELETE ?id= austragen. Jeder trägt sich selbst ein, Planer/Admins alle.
 * Planer setzen zusätzliche Tage an: POST { zusatztag: { datum, anlass? } }, DELETE ?zusatztag=JJJJ-MM-TT (nur ohne Einträge).
 */
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
  let [liste, zusatz] = await Promise.all([bereitschaftLaden(ab), zusatztageLaden()]);
  const zusatzLoeschen = new URL(req.url).searchParams.get('zusatztag');

  if (req.method === 'POST') {
    const b = (await req.json().catch(() => ({}))) as { email?: unknown; von?: unknown; bis?: unknown; zusatztag?: { datum?: unknown; anlass?: unknown } };
    if (b.zusatztag) {
      if (!planer) return json({ fehler: 'Nur Planer dürfen zusätzliche Tage ansetzen' }, 403);
      const datum = String(b.zusatztag.datum ?? '');
      const anlass = typeof b.zusatztag.anlass === 'string' ? b.zusatztag.anlass.trim().slice(0, 80) : '';
      const fehler = zusatztagFehler(datum, zusatz);
      if (fehler) return json({ fehler }, 400);
      if (datum < datumText(new Date())) return json({ fehler: 'Vergangene Tage können nicht angesetzt werden' }, 400);
      const z = { datum, ...(anlass ? { anlass } : {}) };
      await zusatztagSpeichern(z);
      zusatz = [...zusatz, z];
    } else {
      const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim().toLowerCase() : ich;
      if (email !== ich && !planer) return json({ fehler: 'Du darfst nur dich selbst eintragen' }, 403);
      const person = a.konfig.benutzer.find((x) => x.email === email);
      if (email !== ich && !person) return json({ fehler: 'Unbekannter Mitarbeiter' }, 400);
      const neu = { email, von: String(b.von ?? ''), bis: String(b.bis ?? '') };
      const fehler = einsatzFehler(liste, neu, rollen, zusatz);
      if (fehler) return json({ fehler }, 400);
      const name = person?.name ?? (email === ich ? a.sitzung.name : undefined);
      const e: Einsatz = { id: randomBytes(9).toString('base64url'), ...neu, ...(name ? { name } : {}), eingetragenVon: ich, erstellt: Date.now() };
      await einsatzSpeichern(e);
      // Gleichzeitige Anfragen: nach dem Speichern gegen alle anderen Einträge erneut prüfen und bei Konflikt den eigenen
      // zurücknehmen. Im ungünstigsten Fall werden beide abgelehnt, aber nie mehr als erlaubt eingetragen.
      // Auch gegen einen gleichzeitig entfernten Zusatztag.
      [liste, zusatz] = await Promise.all([bereitschaftLaden(ab), zusatztageLaden()]);
      const konflikt = einsatzFehler(liste.filter((x) => x.id !== e.id), neu, rollen, zusatz);
      if (konflikt) {
        await einsatzLoeschen(e);
        return json({ fehler: konflikt }, 409);
      }
    }
  } else if (req.method === 'DELETE' && zusatzLoeschen) {
    if (!planer) return json({ fehler: 'Nur Planer dürfen zusätzliche Tage entfernen' }, 403);
    if (!zusatz.some((z) => z.datum === zusatzLoeschen)) return json({ fehler: 'Tag nicht gefunden' }, 404);
    const tag = { von: `${zusatzLoeschen}T00:00`, bis: `${datumText(plusTage(new Date(`${zusatzLoeschen}T12:00`), 1))}T00:00` };
    if (einsaetzeIn(liste, tag).length) return json({ fehler: 'Bitte zuerst alle Eingeteilten austragen' }, 409);
    const alt = zusatz.find((z) => z.datum === zusatzLoeschen)!;
    await zusatztagLoeschen(zusatzLoeschen);
    // Hat sich währenddessen jemand eingetragen, bleibt der Tag bestehen.
    liste = await bereitschaftLaden(ab);
    if (einsaetzeIn(liste, tag).length) {
      await zusatztagSpeichern(alt);
      return json({ fehler: 'Inzwischen hat sich jemand eingetragen – bitte zuerst austragen' }, 409);
    }
    zusatz = zusatz.filter((z) => z.datum !== zusatzLoeschen);
  } else if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    const e = liste.find((x) => x.id === id);
    if (!e) return json({ fehler: 'Eintrag nicht gefunden' }, 404);
    if (e.email !== ich && !planer) return json({ fehler: 'Du darfst nur dich selbst austragen' }, 403);
    await einsatzLoeschen(e);
    liste = liste.filter((x) => x.id !== id);
  }

  // Im Hub einstellbar: nur eigene Einträge sehen (Planer sehen immer alles).
  const nurEigene = !planer && sichtFuer(a.rechte, a.konfig).bereitschaft === 'eigene';
  return json({
    ...(nurEigene ? { nurEigene: true } : {}),
    darfTelefonplan: darfTelefonplan(a.rechte, a.konfig, rollen),
    eintraege: liste.filter((e) => !nurEigene || e.email === ich).map(({ eingetragenVon, erstellt: _e, ...rest }) => (planer ? { ...rest, eingetragenVon } : rest)),
    darfPlanen: planer,
    zusatz: zusatz.filter((z) => z.datum >= ab),
    ich: { email: ich, name: a.sitzung.name },
    personen: planer ? mitRolle(a.konfig.benutzer, 'bereitschaft').map((x) => ({ email: x.email, name: x.name })) : [],
    dritter: a.konfig.benutzer.filter((x) => x.dritterNoetig).map((x) => x.email.toLowerCase()),
    darfEintragen: !rolleAktiv || hatRolle(rollen.find((x) => x.email === ich), 'bereitschaft'),
  });
};

export const config: Config = { path: '/api/bereitschaft', method: ['GET', 'POST', 'DELETE'] };
