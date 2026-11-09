import { describe, expect, it } from 'vitest';
import { aufnahmeSignaturPasst, csv, darfAbholen, darfTelefon, eingabePruefen, nachtragen, suchen, teilText, type Mitschrift } from './telefon';
import type { Rechte } from './rechte';

const r = (email: string, admin = false): Rechte => ({ email, admin, freigeschaltet: true, gruppen: [], kategorien: [], kalender: [] });
const basis: Mitschrift = { id: 'a', art: 'sterbefall', zeit: Date.parse('2026-11-09T10:00:00Z'), erstellt: 0, von: 'tina@x.at', anrufer: 'Sohn', nummer: '0664 123', notiz: '', verstorbener: 'Maria Huber', ortArt: 'pflegeheim', ort: 'Haus Ternitz', status: 'offen' };

describe('Telefondienst', () => {
  it('prüft Pflichtangaben und bereinigt', () => {
    const jetzt = Date.parse('2026-11-09T12:00:00Z');
    expect(eingabePruefen({ art: 'sterbefall', anrufer: 'Sohn' }, jetzt).fehler).toMatch(/Verstorbenen/);
    expect(eingabePruefen({ art: 'anliegen', anrufer: 'Frau K' }, jetzt).fehler).toMatch(/Anliegen/);
    const ok = eingabePruefen({ art: 'sterbefall', verstorbener: ' Maria ', nummer: '0664/12 34<x>', zeit: jetzt + 3_600_000, polizei: true, geburtsdatum: '1940-13-01' }, jetzt);
    expect(ok.fehler).toBeNull();
    expect(ok.felder).toMatchObject({ verstorbener: 'Maria', nummer: '0664/12 34', zeit: jetzt, polizei: true, geburtsdatum: undefined });
  });
  it('trägt bei der Abholung nur fehlende Daten nach', () => {
    const n = nachtragen({ ...basis, verstorbener: '' }, { verstorbener: 'Maria Huber', ort: 'anders', geburtsdatum: '1940-02-03' });
    expect(n).toMatchObject({ verstorbener: 'Maria Huber', ort: 'Haus Ternitz', geburtsdatum: '1940-02-03' });
  });
  it('Rechte nach Rolle', () => {
    const personen = [{ email: 'tina@x.at', rollen: ['telefon' as const] }, { email: 'bert@x.at', rollen: ['bereitschaft' as const] }, { email: 'otto@x.at' }];
    expect(darfTelefon(r('tina@x.at'), personen)).toBe(true);
    expect(darfTelefon(r('bert@x.at'), personen)).toBe(false);
    expect(darfAbholen(r('bert@x.at'), personen)).toBe(true);
    expect(darfAbholen(r('otto@x.at'), personen)).toBe(false);
    expect(darfTelefon(r('otto@x.at', true), personen)).toBe(true);
    expect(darfTelefon(r('otto@x.at'), [{ email: 'otto@x.at' }])).toBe(true);
  });
  it('sucht und exportiert', () => {
    const l = [basis, { ...basis, id: 'b', art: 'anliegen' as const, anliegen: 'Frage zur Rechnung', verstorbener: undefined, status: 'erledigt' as const }];
    expect(suchen(l, { text: 'huber ternitz' }).map((m) => m.id)).toEqual(['a']);
    expect(suchen(l, { art: 'anliegen' }).map((m) => m.id)).toEqual(['b']);
    expect(suchen(l, { status: 'offen' }).map((m) => m.id)).toEqual(['a']);
    expect(suchen(l, { von: '2026-11-10' })).toEqual([]);
    const c = csv([{ ...basis, notiz: 'sagt "bitte"; rasch' }]);
    expect(c.startsWith('\ufeffZeit;Art')).toBe(true);
    expect(c).toContain('"sagt ""bitte""; rasch"');
    expect(teilText(basis)).toContain('Sterbeort: Pflegeheim – Haus Ternitz');
  });
  it('erkennt Audioformate', () => {
    expect(aufnahmeSignaturPasst(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), 'audio/webm')).toBe(true);
    expect(aufnahmeSignaturPasst(new TextEncoder().encode('OggS....'), 'audio/ogg')).toBe(true);
    expect(aufnahmeSignaturPasst(new TextEncoder().encode('%PDF-'), 'audio/mpeg')).toBe(false);
  });
});
