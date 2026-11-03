import type { Config } from '@netlify/functions';
import { darfVerwalten } from '../../src/shared/abwesenheit';
import { abwesendHeute, bereitschaftHeute, heuteText, termineHeute, type HeuteHinweis } from '../../src/shared/heute';
import { darfKalender, darfSehen } from '../../src/shared/rechte';
import { KATEGORIEN, kategorieAus, type GoogleEvent } from '../../src/planung/planungLogic';
import { alleKalender } from '../lib/kalender';
import { abwesenheitenLaden, angemeldetOderHub, bereitschaftLaden, env, googleGet, json, personalLaden } from '../lib/server';

/** Tagesübersicht für das Dashboard im Hub: heutige Termine, Bereitschaft, Abwesenheiten – gefiltert nach den Rechten der Person. */
export default async (req: Request) => {
  const a = await angemeldetOderHub(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'kein Zugriff' }, 403);

  const origin = new URL(req.url).origin;
  const ich = a.sitzung.email.toLowerCase();
  const heute = heuteText();
  const jetzt = Date.now();
  const verwalter = darfVerwalten(a.rechte, a.konfig);

  const kalender = (await alleKalender(a.konfig, env('CALENDAR_IDS'))).filter((k) => darfKalender(a.rechte, k.id));
  const [ergebnisse, einsaetze, abwesenheiten, personal] = await Promise.all([
    Promise.allSettled(
      kalender.map(async (k) => {
        const r = await googleGet<{ items?: GoogleEvent[] }>(`/calendars/${encodeURIComponent(k.id)}/events`, {
          timeMin: new Date(jetzt - 36 * 3_600_000).toISOString(),
          timeMax: new Date(jetzt + 36 * 3_600_000).toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250',
        });
        return (r.items ?? [])
          .map((event) => ({ kalenderId: k.id, event, kategorie: kategorieAus(event) }))
          .filter((x) => darfSehen(a.rechte, k.id, x.kategorie));
      }),
    ),
    bereitschaftLaden(heute).catch(() => []),
    abwesenheitenLaden().catch(() => []),
    personalLaden().catch(() => []),
  ]);

  const namen = new Map<string, string>([...a.konfig.benutzer.map((b) => [b.email, b.name ?? ''] as [string, string]), ...personal.map((p) => [p.email, p.name] as [string, string])]);
  const termine = termineHeute(
    ergebnisse.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
    heute,
    ich,
    origin,
  ).map((t) => ({ ...t, symbol: KATEGORIEN[t.kategorie as keyof typeof KATEGORIEN]?.symbol }));

  const hinweise: HeuteHinweis[] = [];
  if (verwalter) {
    const offen = abwesenheiten.filter((x) => x.status === 'beantragt').length;
    if (offen) hinweise.push({ text: `${offen} offene${offen === 1 ? 'r' : ''} Urlaubsantr${offen === 1 ? 'ag' : 'äge'}`, ziel: `${origin}/abwesenheit` });
  }

  return json({
    datum: heute,
    eintraege: [...termine, ...bereitschaftHeute(einsaetze, heute, ich, origin, namen), ...abwesendHeute(abwesenheiten, heute, ich, verwalter, origin, namen)],
    hinweise,
    fehler: ergebnisse.flatMap((r, i) => (r.status === 'rejected' ? [`${kalender[i].name}: ${(r.reason as Error).message}`] : [])),
  });
};

export const config: Config = { path: '/api/heute', method: ['GET'] };
