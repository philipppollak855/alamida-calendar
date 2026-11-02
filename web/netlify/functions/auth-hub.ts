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
  const wert = sitzungSignieren({ ...person, exp: Date.now() + SESSION_TAGE * 86_400_000 });
  return json({ ok: true, sitzung: wert }, 200, { 'set-cookie': cookie(SESSION_COOKIE, wert, SESSION_TAGE * 86_400) });
};

export const config: Config = { path: '/api/auth/hub', method: ['POST'] };
