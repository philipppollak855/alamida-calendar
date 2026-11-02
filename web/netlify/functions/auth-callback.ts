import type { Config } from '@netlify/functions';
import { SESSION_COOKIE, SESSION_TAGE, clientId, cookie, cookies, env, sitzungSignieren } from '../lib/server';

const zurueck = (fehler: string) =>
  new Response(null, { status: 302, headers: { location: `/?fehler=${encodeURIComponent(fehler)}` } });

export default async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error')) return zurueck(`Google: ${url.searchParams.get('error')}`);
  if (!code || url.searchParams.get('state') !== cookies(req).alamida_state) return zurueck('Anmeldung abgelaufen, bitte erneut versuchen');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      redirect_uri: `${url.origin}/api/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) return zurueck(`Google-Anmeldung fehlgeschlagen (${res.status})`);
  const { id_token } = (await res.json()) as { id_token?: string };
  // id_token kommt direkt per TLS von Google, daher genügt das Auslesen der Nutzdaten.
  const p = JSON.parse(Buffer.from((id_token ?? '').split('.')[1] ?? '', 'base64url').toString() || '{}') as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    aud?: string;
  };
  if (!p.email || !p.email_verified || p.aud !== clientId()) return zurueck('E-Mail-Adresse nicht bestätigt');

  const wert = sitzungSignieren({ email: p.email.toLowerCase(), name: p.name, bild: p.picture, exp: Date.now() + SESSION_TAGE * 86_400_000 });
  const headers = new Headers({ location: '/' });
  headers.append('set-cookie', cookie(SESSION_COOKIE, wert, SESSION_TAGE * 86_400));
  headers.append('set-cookie', cookie('alamida_state', '', 0));
  return new Response(null, { status: 302, headers });
};

export const config: Config = { path: '/api/auth/callback' };
