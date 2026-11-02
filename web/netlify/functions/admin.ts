import type { Config } from '@netlify/functions';
import { konfigPruefen } from '../../src/shared/rechte';
import { angemeldet, env, json, konfigSpeichern, serviceAccount } from '../lib/server';
import { alleKalender } from '../lib/kalender';

export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a?.rechte.admin) return json({ fehler: 'nur für Administratoren' }, 403);
  if (req.method === 'PUT') {
    const k = konfigPruefen(await req.json());
    await konfigSpeichern(k);
    return json({ konfig: k });
  }
  let serviceAccountEmail = '';
  try {
    serviceAccountEmail = serviceAccount().client_email;
  } catch {
    /* nicht konfiguriert */
  }
  return json({ konfig: a.konfig, kalenderGefunden: await alleKalender(a.konfig, env('CALENDAR_IDS')), serviceAccountEmail });
};

export const config: Config = { path: '/api/admin', method: ['GET', 'PUT'] };
