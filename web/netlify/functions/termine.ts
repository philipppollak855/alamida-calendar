import type { Config } from '@netlify/functions';
import { darfKalender, darfSehen } from '../../src/shared/rechte';
import { kategorieAus, type GoogleEvent } from '../../src/planung/planungLogic';
import { angemeldet, env, googleGet, json } from '../lib/server';
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
      return { kalender: k, events: events.filter((e) => darfSehen(a.rechte, k.id, kategorieAus(e))) };
    }),
  );
  return json({
    kalender: ergebnisse.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
    fehler: ergebnisse.flatMap((r, i) => (r.status === 'rejected' ? [`${kalender[i].name}: ${(r.reason as Error).message}`] : [])),
  });
};

export const config: Config = { path: '/api/termine' };
