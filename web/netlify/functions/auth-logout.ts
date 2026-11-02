import type { Config } from '@netlify/functions';
import { SESSION_COOKIE, cookie, json } from '../lib/server';

export default async () => json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', 0) });

export const config: Config = { path: '/api/auth/logout', method: 'POST' };
