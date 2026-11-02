import type { Config } from '@netlify/functions';
import { SESSION_COOKIE, SESSION_TAGE, clientId, cookie, cookies, env, redirectUri, sitzungSignieren } from '../lib/server';

/**
 * Tauscht den Google-Code gegen eine Sitzung.
 * GET: Google leitet direkt hierher (Weiterleitungs-URI …/api/auth/callback).
 * POST {code, state}: Google leitet auf die Startseite (OAUTH_REDIRECT_URI), die Seite reicht den Code weiter.
 */
async function anmelden(req: Request, code: string | null, state: string | null): Promise<{ fehler: string } | { cookie: string }> {
  if (!code || !state || state !== cookies(req).alamida_state) return { fehler: 'Anmeldung abgelaufen, bitte erneut versuchen' };
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri(new URL(req.url).origin),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) return { fehler: `Google-Anmeldung fehlgeschlagen (${res.status})` };
  const { id_token } = (await res.json()) as { id_token?: string };
  // id_token kommt direkt per TLS von Google, daher genügt das Auslesen der Nutzdaten.
  const p = JSON.parse(Buffer.from((id_token ?? '').split('.')[1] ?? '', 'base64url').toString() || '{}') as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    aud?: string;
  };
  if (!p.email || !p.email_verified || p.aud !== clientId()) return { fehler: 'E-Mail-Adresse nicht bestätigt' };
  const wert = sitzungSignieren({ email: p.email.toLowerCase(), name: p.name, bild: p.picture, exp: Date.now() + SESSION_TAGE * 86_400_000 });
  return { cookie: cookie(SESSION_COOKIE, wert, SESSION_TAGE * 86_400) };
}

export default async (req: Request) => {
  const headers = new Headers();
  headers.append('set-cookie', cookie('alamida_state', '', 0));

  if (req.method === 'POST') {
    const b = (await req.json().catch(() => ({}))) as { code?: string; state?: string };
    const r = await anmelden(req, b.code ?? null, b.state ?? null);
    headers.set('content-type', 'application/json; charset=utf-8');
    if ('fehler' in r) return new Response(JSON.stringify({ fehler: r.fehler }), { status: 400, headers });
    headers.append('set-cookie', r.cookie);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  const url = new URL(req.url);
  const r = url.searchParams.get('error')
    ? { fehler: `Google: ${url.searchParams.get('error')}` }
    : await anmelden(req, url.searchParams.get('code'), url.searchParams.get('state'));
  if ('fehler' in r) headers.set('location', `/?fehler=${encodeURIComponent(r.fehler)}`);
  else {
    headers.set('location', '/');
    headers.append('set-cookie', r.cookie);
  }
  return new Response(null, { status: 302, headers });
};

export const config: Config = { path: '/api/auth/callback', method: ['GET', 'POST'] };
