/** Offline-Zwischenspeicher je Benutzer (localStorage). Kiosk-Sitzungen speichern nichts. */
export const OFFLINE_TEXT = 'Offline – keine Verbindung. Änderungen sind erst wieder mit Netz möglich.';
const PREFIX = 'alamida.c.';

export class OfflineFehler extends Error {
  constructor() {
    super(OFFLINE_TEXT);
    this.name = 'OfflineFehler';
  }
}

export const istOffline = (e: unknown): e is OfflineFehler => e instanceof OfflineFehler;

export interface Gemerkt<T> {
  zeit: number;
  daten: T;
}

type Speicher = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export function cacheSchreiben(s: Speicher, benutzer: string, schluessel: string, daten: unknown, jetzt = Date.now()): void {
  if (!benutzer) return;
  try {
    s.setItem(`${PREFIX}${benutzer}:${schluessel}`, JSON.stringify({ zeit: jetzt, daten }));
  } catch {
    /* Speicher voll oder gesperrt */
  }
}

export function cacheLesen<T>(s: Speicher, benutzer: string, schluessel: string): Gemerkt<T> | null {
  if (!benutzer) return null;
  try {
    const c = JSON.parse(s.getItem(`${PREFIX}${benutzer}:${schluessel}`) ?? 'null') as Gemerkt<T> | null;
    return c && typeof c.zeit === 'number' ? c : null;
  } catch {
    return null;
  }
}

export function cacheLeeren(s: Speicher): void {
  try {
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) s.removeItem(k);
    }
  } catch {
    /* egal */
  }
}

export const standText = (zeit: number) =>
  `Offline – angezeigt wird der Stand vom ${new Intl.DateTimeFormat('de-AT', { dateStyle: 'short', timeStyle: 'short' }).format(zeit)}.`;
