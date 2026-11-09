import type { Config } from '@netlify/functions';
import { darfVerwalten } from '../../src/shared/abwesenheit';
import { randomBytes } from 'node:crypto';
import { berichtGleich, eintragPruefen, einstellungenPruefen, gueltigerMonat, monatsbericht, type BerichtArchiv, type MonatsEintrag } from '../../src/shared/zeitkonto';
import {
  abwesenheitenLaden,
  angemeldet,
  berichtArchivLaden,
  berichtArchivLoeschen,
  berichtArchivSpeichern,
  json,
  personalLaden,
  zeitkontoLaden,
  zeitkontoSpeichern,
} from '../lib/server';

/**
 * Zeitkonten für die Buchhaltung: GET (Verwalter alles, sonst nur eigene Monate);
 * PUT { eintraege } Monate abschließen/ändern, PUT { einstellungen } Monats-Verschiebung; DELETE ?email=&monat= Monatsabschluss entfernen.
 * ?aktion=archiv (nur Verwalter): GET Liste, POST { monat } Bericht archivieren (gleicher Stand wird nicht doppelt abgelegt), DELETE ?monat=&id=.
 */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'keine Freigabe' }, 403);
  const verwalter = darfVerwalten(a.rechte, a.konfig);
  const ich = a.sitzung.email.toLowerCase();
  let d = await zeitkontoLaden();
  const url = new URL(req.url);

  if (url.searchParams.get('aktion') === 'archiv') {
    if (!verwalter) return json({ fehler: 'Dafür fehlt dir das Recht' }, 403);
    let archiv = await berichtArchivLaden();
    if (req.method === 'POST') {
      const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (!gueltigerMonat(b.monat)) return json({ fehler: 'Ungültiger Monat' }, 400);
      const externe = new Set(a.konfig.benutzer.filter((x) => x.extern).map((x) => x.email));
      const [personal, abw] = await Promise.all([personalLaden(), abwesenheitenLaden()]);
      const gruppen = monatsbericht(personal.filter((p) => !externe.has(p.email)), abw, d, b.monat);
      if (!gruppen.some((g) => g.zeilen.length)) return json({ fehler: 'Für diesen Monat ist noch niemand abgeschlossen' }, 400);
      const neu: BerichtArchiv = { id: randomBytes(6).toString('base64url'), monat: b.monat, erstellt: Date.now(), von: a.sitzung.name || ich, einstellungen: d.einstellungen, gruppen };
      const letzter = archiv.find((x) => x.monat === neu.monat);
      if (!letzter || !berichtGleich(letzter, neu)) {
        await berichtArchivSpeichern(neu);
        archiv = [neu, ...archiv].sort((x, y) => y.monat.localeCompare(x.monat) || y.erstellt - x.erstellt);
      }
    } else if (req.method === 'DELETE') {
      const monat = url.searchParams.get('monat');
      const id = url.searchParams.get('id') ?? '';
      const e = archiv.find((x) => x.monat === monat && x.id === id);
      if (!e) return json({ fehler: 'Bericht nicht gefunden' }, 404);
      await berichtArchivLoeschen(e);
      archiv = archiv.filter((x) => x !== e);
    } else if (req.method !== 'GET') return json({ fehler: 'Methode nicht erlaubt' }, 405);
    return json({ archiv });
  }

  if (req.method !== 'GET') {
    if (!verwalter) return json({ fehler: 'Dafür fehlt dir das Recht' }, 403);
    if (req.method === 'PUT') {
      const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (b.einstellungen) d = { ...d, einstellungen: einstellungenPruefen(b.einstellungen) };
      if (Array.isArray(b.eintraege)) {
        if (b.eintraege.length > 5000) return json({ fehler: 'Zu viele Einträge auf einmal' }, 400);
        const neu = new Map<string, MonatsEintrag>();
        for (const x of b.eintraege) {
          const e = eintragPruefen(x);
          if (!e) return json({ fehler: 'Ungültiger Monatseintrag' }, 400);
          neu.set(`${e.email}|${e.monat}`, { ...e, geaendert: Date.now(), von: ich });
        }
        d = { ...d, eintraege: [...d.eintraege.filter((e) => !neu.has(`${e.email}|${e.monat}`)), ...neu.values()] };
      }
    } else if (req.method === 'DELETE') {
      const email = (url.searchParams.get('email') ?? '').toLowerCase();
      const monat = url.searchParams.get('monat');
      if (!email || !gueltigerMonat(monat)) return json({ fehler: 'Mitarbeiter und Monat fehlen' }, 400);
      d = { ...d, eintraege: d.eintraege.filter((e) => !(e.email === email && e.monat === monat)) };
    } else return json({ fehler: 'Methode nicht erlaubt' }, 405);
    d.eintraege.sort((x, y) => x.monat.localeCompare(y.monat) || x.email.localeCompare(y.email));
    await zeitkontoSpeichern(d);
  }

  return json(verwalter ? d : { ...d, eintraege: d.eintraege.filter((e) => e.email === ich) });
};

export const config: Config = { path: '/api/zeitkonto', method: ['GET', 'POST', 'PUT', 'DELETE'] };
