import { describe, expect, it } from 'vitest';
import { cacheLeeren, cacheLesen, cacheSchreiben, istOffline, OfflineFehler } from './offlineCache';

class Fake {
  m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key = (i: number) => [...this.m.keys()][i] ?? null;
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

describe('Offline-Cache', () => {
  it('speichert je Benutzer getrennt', () => {
    const s = new Fake();
    cacheSchreiben(s, 'a@x.at', 'termine', [1, 2], 1000);
    expect(cacheLesen(s, 'a@x.at', 'termine')).toEqual({ zeit: 1000, daten: [1, 2] });
    expect(cacheLesen(s, 'b@x.at', 'termine')).toBeNull();
  });
  it('speichert ohne Benutzer (Kiosk) nichts', () => {
    const s = new Fake();
    cacheSchreiben(s, '', 'termine', [1]);
    expect(s.length).toBe(0);
    expect(cacheLesen(s, '', 'termine')).toBeNull();
  });
  it('leert nur eigene Einträge', () => {
    const s = new Fake();
    s.setItem('alamida.theme', 'hell');
    cacheSchreiben(s, 'a@x.at', 'termine', 1);
    cacheSchreiben(s, 'b@x.at', 'abwesenheit', 2);
    cacheLeeren(s);
    expect([...s.m.keys()]).toEqual(['alamida.theme']);
  });
  it('erkennt Offline-Fehler und übersteht kaputte Daten', () => {
    expect(istOffline(new OfflineFehler())).toBe(true);
    expect(istOffline(new Error('x'))).toBe(false);
    const s = new Fake();
    s.setItem('alamida.c.a@x.at:termine', '{kaputt');
    expect(cacheLesen(s, 'a@x.at', 'termine')).toBeNull();
  });
});
