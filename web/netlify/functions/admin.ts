import type { Config } from '@netlify/functions';
import { konfigPruefen } from '../../src/shared/rechte';
import { agentStatusLaden, angemeldet, env, json, konfigLaden, konfigLokal, konfigSpeichern, serviceAccount } from '../lib/server';
import { alleKalender } from '../lib/kalender';

export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a?.rechte.admin) return json({ fehler: 'nur für Administratoren' }, 403);
  if (req.method === 'PUT') {
    const k = konfigPruefen(await req.json());
    if (a.konfig.hubVerwaltet) {
      // Mitarbeiter, Domains und Gruppen-Namen pflegt der Hub; gespeichert werden nur die Kalender-Rechte je Gruppe.
      const lokal = await konfigLokal();
      const ids = new Set(a.konfig.gruppen.map((g) => g.id));
      const rechte = new Map(k.gruppen.filter((g) => ids.has(g.id)).map((g) => [g.id, g]));
      await konfigSpeichern({
        ...k,
        benutzer: lokal.benutzer,
        domains: lokal.domains,
        gruppen: [
          ...a.konfig.gruppen.map((g) => ({ ...g, kategorien: rechte.get(g.id)?.kategorien ?? g.kategorien, kalender: rechte.get(g.id)?.kalender ?? g.kalender })),
          ...lokal.gruppen.filter((g) => !ids.has(g.id)),
        ],
      });
      return json({ konfig: await konfigLaden() });
    }
    await konfigSpeichern(k);
    return json({ konfig: k });
  }
  let serviceAccountEmail = '';
  try {
    serviceAccountEmail = serviceAccount().client_email;
  } catch {
    /* nicht konfiguriert */
  }
  const [kalenderGefunden, agentStatus] = await Promise.all([
    alleKalender(a.konfig, env('CALENDAR_IDS')),
    agentStatusLaden().catch(() => []),
  ]);
  return json({ konfig: a.konfig, kalenderGefunden, serviceAccountEmail, agentStatus });
};

export const config: Config = { path: '/api/admin', method: ['GET', 'PUT'] };
