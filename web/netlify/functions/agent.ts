import type { Config } from '@netlify/functions';
import { agentAntwort, agentStatusPruefen, agentTokenPruefen } from '../lib/agent';
import { agentStatusSpeichern, json, konfigLaden, serviceAccount } from '../lib/server';

/** Schnittstelle für den Alamida-Agent: zentrale Kategorie-Einstellungen holen, Status melden. */
export default async (req: Request) => {
  let sa: ReturnType<typeof serviceAccount>;
  try {
    sa = serviceAccount();
  } catch {
    return json({ fehler: 'Service Account nicht konfiguriert' }, 500);
  }
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !agentTokenPruefen(auth.slice(7), sa)) return json({ fehler: 'nicht berechtigt' }, 401);
  if (req.method === 'POST') {
    const s = agentStatusPruefen(await req.json().catch(() => null));
    if (!s) return json({ fehler: 'ungültige Meldung' }, 400);
    await agentStatusSpeichern(s);
    return json({ ok: true });
  }
  return json(agentAntwort(await konfigLaden()));
};

export const config: Config = { path: '/api/agent', method: ['GET', 'POST'] };
