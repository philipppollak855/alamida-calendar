import type { Config } from '@netlify/functions';
import { darfKalender, darfSehen, sichtFuer } from '../../src/shared/rechte';
import { terminMeins } from '../../src/shared/heute';
import { terminSichtbar } from '../../src/shared/neuerTermin';
import { kategorieAus, type GoogleEvent } from '../../src/planung/planungLogic';
import { angemeldet, einteilungenLaden, env, googleGet, json, personalLaden } from '../lib/server';
import { alleKalender } from '../lib/kalender';

export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'kein Zugriff' }, 403);

  const url = new URL(req.url);
  const tag = 86_400_000;
  const von = new Date(Number(url.searchParams.get('von')) || Date.now() - 60 * tag);
  const bis = new Date(Number(url.searchParams.get('bis')) || Date.now() + 180 * tag);

  const kalender = (await alleKalender(a.konfig, env('CALENDAR_IDS'))).filter((k) => darfKalender(a.rechte, k.id));
  // Im Hub einstellbar: nur Termine, bei denen die Person eingeteilt ist.
  const nurEigene = sichtFuer(a.rechte, a.konfig).termine === 'eigene';
  const ich = a.rechte.email;
  const eingeteilt = nurEigene ? new Map((await einteilungenLaden()).map((e) => [e.termin, e.personen])) : null;
  const ergebnisse = await Promise.allSettled(
    kalender.map(async (k) => {
      const events: GoogleEvent[] = [];
      let pageToken: string | undefined;
      do {
        const r = await googleGet<{ items?: GoogleEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(k.id)}/events`, {
          timeMin: von.toISOString(),
          timeMax: bis.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '2500',
          ...(pageToken ? { pageToken } : {}),
        });
        events.push(...(r.items ?? []));
        pageToken = r.nextPageToken;
      } while (pageToken);
      return {
        kalender: k,
        events: events.filter((e) => darfSehen(a.rechte, k.id, kategorieAus(e)) && terminSichtbar(a.rechte, e.extendedProperties?.private) && (!eingeteilt || terminMeins(k.id, e, kategorieAus(e), ich, eingeteilt))),
      };
    }),
  );
  // Geburtstage aus der Personalakte, jedes Jahr ganztägig (nicht in Google gespeichert).
  const geburtstage: GoogleEvent[] = [];
  if (!nurEigene) {
    for (const [n, p] of (await personalLaden().catch(() => [])).entries()) {
      const g = p.akte?.geburtsdatum;
      if (!g) continue;
      for (let j = von.getUTCFullYear(); j <= bis.getUTCFullYear(); j++) {
        const tag0 = `${j}${g.slice(4)}`;
        const t0 = Date.parse(tag0);
        if (Number.isNaN(t0) || new Date(t0).getUTCMonth() + 1 !== Number(g.slice(5, 7)) || t0 + tag <= von.getTime() || t0 >= bis.getTime()) continue;
        const t1 = new Date(t0 + tag).toISOString().slice(0, 10);
        geburtstage.push({ id: `geb-${n}-${j}`, summary: `🎂 ${p.name || p.email.split('@')[0]}`, start: { date: tag0 }, end: { date: t1 } } as GoogleEvent);
      }
    }
  }
  const erfolgreich = ergebnisse.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (geburtstage.length) erfolgreich.push({ kalender: { id: 'geburtstage', name: '🎂 Geburtstage' }, events: geburtstage });
  return json({
    ...(nurEigene ? { nurEigene: true } : {}),
    kalender: erfolgreich,
    fehler: ergebnisse.flatMap((r, i) => (r.status === 'rejected' ? [`${kalender[i].name}: ${(r.reason as Error).message}`] : [])),
  });
};

export const config: Config = { path: '/api/termine' };
