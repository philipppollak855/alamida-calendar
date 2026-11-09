import type { Config } from '@netlify/functions';
import { darfVerwalten } from '../../src/shared/abwesenheit';
import { eintragPruefen, einstellungenPruefen, gueltigerMonat, type MonatsEintrag } from '../../src/shared/zeitkonto';
import { angemeldet, json, zeitkontoLaden, zeitkontoSpeichern } from '../lib/server';

/**
 * Zeitkonten für die Buchhaltung: GET (Verwalter alles, sonst nur eigene Monate);
 * PUT { eintraege } Monate abschließen/ändern, PUT { einstellungen } Monats-Verschiebung; DELETE ?email=&monat= Monatsabschluss entfernen.
 */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'keine Freigabe' }, 403);
  const verwalter = darfVerwalten(a.rechte, a.konfig);
  const ich = a.sitzung.email.toLowerCase();
  let d = await zeitkontoLaden();

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
      const url = new URL(req.url);
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

export const config: Config = { path: '/api/zeitkonto', method: ['GET', 'PUT', 'DELETE'] };
