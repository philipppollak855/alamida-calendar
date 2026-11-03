import type { Config } from '@netlify/functions';
import { SESSION_COOKIE, SESSION_TAGE, cookie, hubTicketPruefen, json, sitzungSignieren } from '../lib/server';

/**
 * POST {ticket}: Anmeldung über den Bestattung Stranz HUB, ohne zweites Google-Login.
 * Liefert die Sitzung zusätzlich im JSON, weil eingebettet im Hub (fremde Seite) das Cookie blockiert wird.
 */
export default async (req: Request) => {
  const { ticket } = (await req.json().catch(() => ({}))) as { ticket?: string };
  let person;
  try {
    person = hubTicketPruefen(ticket ?? '', new URL(req.url).origin);
  } catch (e) {
    return json({ fehler: (e as Error).message }, 500);
  }
  if (!person) return json({ fehler: 'Anmeldung über den Hub ungültig oder abgelaufen' }, 401);
  const { sitzungBis, ...rest } = person;
  // Kiosk: höchstens so lange wie die Hub-Sitzung (+ Puffer, weil der Hub sie bei Bedienung verlängert), sonst 90 Tage.
  const exp = rest.kiosk ? Math.min((sitzungBis ?? Date.now()) + 30 * 60_000, Date.now() + 12 * 3_600_000) : Date.now() + SESSION_TAGE * 86_400_000;
  const wert = sitzungSignieren({ ...rest, exp });
  return json({ ok: true, sitzung: wert }, 200, { 'set-cookie': cookie(SESSION_COOKIE, wert, Math.round((exp - Date.now()) / 1000)) });
};

export const config: Config = { path: '/api/auth/hub', method: ['POST'] };
