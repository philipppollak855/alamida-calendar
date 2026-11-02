import type { Config } from '@netlify/functions';
import { clientId, cookie, zufall } from '../lib/server';

export default async (req: Request) => {
  const url = new URL(req.url);
  const state = zufall();
  const ziel = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  ziel.search = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: `${url.origin}/api/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online',
  }).toString();
  return new Response(null, {
    status: 302,
    headers: { location: ziel.toString(), 'set-cookie': cookie('alamida_state', state, 600) },
  });
};

export const config: Config = { path: '/api/auth/login' };
