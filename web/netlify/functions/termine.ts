import type { Config } from '@netlify/functions';
import { darfKalender, darfSehen, sichtFuer } from '../../src/shared/rechte';
import { terminMeins } from '../../src/shared/heute';
import { kategorieAus, type GoogleEvent } from '../../src/planung/planungLogic';
import { angemeldet, einteilungenLaden, env, googleGet, json } from '../lib/server';
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
        events: events.filter((e) => darfSehen(a.rechte, k.id, kategorieAus(e)) && (!eingeteilt || terminMeins(k.id, e, kategorieAus(e), ich, eingeteilt))),
      };
    }),
  );
  return json({
    ...(nurEigene ? { nurEigene: true } : {}),
    kalender: ergebnisse.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
    fehler: ergebnisse.flatMap((r, i) => (r.status === 'rejected' ? [`${kalender[i].name}: ${(r.reason as Error).message}`] : [])),
  });
};

export const config: Config = { path: '/api/termine' };
