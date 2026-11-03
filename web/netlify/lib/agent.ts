import { createPublicKey, verify } from 'node:crypto';
import { AGENT_KATEGORIEN, type Konfiguration } from '../../src/shared/rechte';

/** JWT des Agents (RS256, signiert mit dem Service-Account-Schlüssel, den auch die Web-App hat). */
export function agentTokenPruefen(token: string, sa: { client_email: string; private_key: string }, jetzt = Date.now()): boolean {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return false;
  try {
    if (JSON.parse(Buffer.from(h, 'base64url').toString()).alg !== 'RS256') return false;
    if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey(sa.private_key), Buffer.from(s, 'base64url'))) return false;
    const c = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>;
    const n = jetzt / 1000;
    return (
      c.iss === sa.client_email &&
      c.aud === 'alamida-agent' &&
      typeof c.iat === 'number' &&
      typeof c.exp === 'number' &&
      c.exp > n &&
      c.iat <= n + 60 &&
      c.exp - c.iat <= 600
    );
  } catch {
    return false;
  }
}

export function agentAntwort(k: Konfiguration) {
  const a = k.agent ?? { kategorien: {} };
  return {
    standardKalender: a.standardKalender ?? null,
    /** Für Agents, die noch auf „primary“ (unsichtbarer Kalender des Service Accounts) stehen. */
    ersatzKalender: k.kalender[0]?.id ?? null,
    kategorien: Object.fromEntries(
      AGENT_KATEGORIEN.map((key) => {
        const e = a.kategorien[key] ?? {};
        return [key, { calendarId: e.kalender ?? null, dauerMinuten: e.dauer ?? null, aktiv: e.aktiv ?? null }];
      }),
    ),
  };
}

export interface AgentStatus {
  station: string;
  version: string;
  zeit: number;
  status: string;
  fehler?: string;
  vorsorge?: string;
  maske?: string;
  standardKalender?: string;
  termine?: number;
  zentral?: boolean;
}

const t = (x: unknown, max = 300) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

export function agentStatusPruefen(x: unknown, jetzt = Date.now()): AgentStatus | null {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const station = t(o.station, 80);
  if (!station) return null;
  return {
    station,
    version: t(o.version, 60),
    zeit: jetzt,
    status: t(o.status),
    fehler: t(o.fehler) || undefined,
    vorsorge: t(o.vorsorge) || undefined,
    maske: t(o.maske, 60) || undefined,
    standardKalender: t(o.standardKalender) || undefined,
    termine: typeof o.termine === 'number' ? Math.max(0, Math.round(o.termine)) : undefined,
    zentral: o.zentral === true,
  };
}
