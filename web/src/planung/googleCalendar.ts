import type { GoogleEvent } from './planungLogic';

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const API = 'https://www.googleapis.com/calendar/v3';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface GoogleOAuth {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { message?: string }) => void;
      }): { requestAccessToken(opts?: { prompt?: string }): void };
    };
  };
}

declare global {
  interface Window {
    google?: GoogleOAuth;
  }
}

export interface KalenderInfo {
  id: string;
  name: string;
  farbe?: string;
}

let gisPromise: Promise<void> | null = null;

function ladeGis(): Promise<void> {
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google-Anmeldung konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

/** Holt ein Zugriffstoken (nur Lesen) über die Google-Anmeldung im Browser. */
export async function anmelden(clientId: string, stumm = false): Promise<{ token: string; gueltigBis: number }> {
  await ladeGis();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) reject(new Error(r.error ?? 'Anmeldung fehlgeschlagen'));
        else resolve({ token: r.access_token, gueltigBis: Date.now() + (r.expires_in ?? 3600) * 1000 });
      },
      error_callback: (e) => reject(new Error(e.message ?? 'Anmeldung abgebrochen')),
    });
    client.requestAccessToken({ prompt: stumm ? '' : 'consent' });
  });
}

async function get<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error('Anmeldung abgelaufen');
  if (!res.ok) throw new Error(`Google Kalender: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function kalenderListe(token: string): Promise<KalenderInfo[]> {
  const r = await get<{ items?: { id: string; summary: string; summaryOverride?: string; backgroundColor?: string }[] }>(
    token,
    '/users/me/calendarList',
    { maxResults: '250' },
  );
  return (r.items ?? []).map((c) => ({ id: c.id, name: c.summaryOverride ?? c.summary, farbe: c.backgroundColor }));
}

export async function termineLaden(token: string, kalenderId: string, von: Date, bis: Date): Promise<GoogleEvent[]> {
  const result: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params: Record<string, string> = {
      timeMin: von.toISOString(),
      timeMax: bis.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    };
    if (pageToken) params.pageToken = pageToken;
    const r = await get<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      token,
      `/calendars/${encodeURIComponent(kalenderId)}/events`,
      params,
    );
    result.push(...(r.items ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return result;
}
