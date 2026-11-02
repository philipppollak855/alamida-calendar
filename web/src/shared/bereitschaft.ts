/** Bereitschaft an Wochenenden (Fr–So) und Feiertagen. Zeiten sind lokale Zeitangaben „JJJJ-MM-TTTHH:mm“ (Österreich). */

import { ALLE, type Konfiguration, type Rechte } from './rechte';

export const MAX_GLEICHZEITIG = 3;

export interface Dienst {
  id: string;
  art: 'wochenende' | 'feiertag';
  von: string;
  bis: string;
  feiertage: string[];
}

export interface Einsatz {
  id: string;
  email: string;
  name?: string;
  von: string;
  bis: string;
  eingetragenVon?: string;
  /** Zeitpunkt der Eintragung (ms), für die Reihenfolge bei gleichzeitigen Anfragen. */
  erstellt?: number;
}

const p2 = (n: number) => String(n).padStart(2, '0');
export const datumText = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const zeitText = (d: Date) => `${datumText(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
export const plusTage = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export function ausText(s: string): Date {
  const [j, m, t] = s.slice(0, 10).split('-').map(Number);
  const [h, min] = (s.slice(11, 16) || '00:00').split(':').map(Number);
  return new Date(j, m - 1, t, h || 0, min || 0);
}

/** Ostersonntag (gregorianisch, Algorithmus nach Meeus/Jones/Butcher). */
export function ostersonntag(j: number): Date {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(j, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
}

/** Gesetzliche Feiertage in Österreich. */
export function feiertage(j: number): { datum: string; name: string }[] {
  const o = ostersonntag(j);
  const fest: [number, number, string][] = [
    [1, 1, 'Neujahr'],
    [1, 6, 'Heilige Drei Könige'],
    [5, 1, 'Staatsfeiertag'],
    [8, 15, 'Mariä Himmelfahrt'],
    [10, 26, 'Nationalfeiertag'],
    [11, 1, 'Allerheiligen'],
    [12, 8, 'Mariä Empfängnis'],
    [12, 25, 'Christtag'],
    [12, 26, 'Stefanitag'],
  ];
  return [
    ...fest.map(([m, t, name]) => ({ datum: datumText(new Date(j, m - 1, t)), name })),
    { datum: datumText(plusTage(o, 1)), name: 'Ostermontag' },
    { datum: datumText(plusTage(o, 39)), name: 'Christi Himmelfahrt' },
    { datum: datumText(plusTage(o, 50)), name: 'Pfingstmontag' },
    { datum: datumText(plusTage(o, 60)), name: 'Fronleichnam' },
  ].sort((x, y) => x.datum.localeCompare(y.datum));
}

/** Alle Bereitschaftsdienste, die zwischen `ab` und `bis` (Tage) beginnen: Wochenenden Fr 0:00 – Mo 0:00, Feiertage Mo–Do ganztägig. */
export function dienste(ab: Date, bis: Date): Dienst[] {
  let tag = new Date(ab.getFullYear(), ab.getMonth(), ab.getDate());
  if (tag.getDay() === 6) tag = plusTage(tag, -1);
  if (tag.getDay() === 0) tag = plusTage(tag, -2);
  const ft = new Map<string, string>();
  for (let j = tag.getFullYear(); j <= bis.getFullYear() + 1; j++) for (const f of feiertage(j)) ft.set(f.datum, f.name);
  const liste: Dienst[] = [];
  for (; tag <= bis; tag = plusTage(tag, 1)) {
    const d = datumText(tag);
    if (tag.getDay() === 5) {
      const namen = [0, 1, 2].map((n) => ft.get(datumText(plusTage(tag, n)))).filter((x): x is string => !!x);
      liste.push({ id: `we-${d}`, art: 'wochenende', von: `${d}T00:00`, bis: `${datumText(plusTage(tag, 3))}T00:00`, feiertage: namen });
    } else if (ft.has(d) && tag.getDay() >= 1 && tag.getDay() <= 4) {
      liste.push({ id: `ft-${d}`, art: 'feiertag', von: `${d}T00:00`, bis: `${datumText(plusTage(tag, 1))}T00:00`, feiertage: [ft.get(d)!] });
    }
  }
  return liste;
}

export const ueberschneidet = (a: { von: string; bis: string }, b: { von: string; bis: string }) => a.von < b.bis && b.von < a.bis;

export function einsaetzeIn(eintraege: Einsatz[], z: { von: string; bis: string }): Einsatz[] {
  return eintraege.filter((e) => ueberschneidet(e, z)).sort((a, b) => a.von.localeCompare(b.von) || a.bis.localeCompare(b.bis));
}

/** Höchste Zahl gleichzeitig eingeteilter Personen im Zeitraum von `neu`, inklusive `neu`. */
export function gleichzeitig(eintraege: Einsatz[], neu: { von: string; bis: string }): number {
  const andere = eintraege.filter((e) => ueberschneidet(e, neu));
  const punkte = [neu.von, ...andere.map((e) => e.von).filter((v) => v > neu.von && v < neu.bis)];
  return Math.max(...punkte.map((p) => 1 + andere.filter((e) => e.von <= p && p < e.bis).length));
}

const ZEIT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
/** Format und echtes Datum/Uhrzeit (z. B. kein 25:00 oder 31.02.). */
export const gueltigeZeit = (s: string) => ZEIT.test(s) && zeitText(ausText(s)) === s;

/** Prüft einen neuen Eintrag; liefert eine Fehlermeldung oder null. */
export function einsatzFehler(eintraege: Einsatz[], neu: { email: string; von: string; bis: string }): string | null {
  if (!gueltigeZeit(neu.von) || !gueltigeZeit(neu.bis) || neu.von >= neu.bis) return 'Ungültiger Zeitraum';
  const start = ausText(neu.von);
  const dienst = dienste(plusTage(start, -3), plusTage(start, 3)).find((d) => d.von <= neu.von && neu.bis <= d.bis);
  if (!dienst) return 'Bereitschaft gibt es nur an Wochenenden (Fr–So) und Feiertagen';
  if (eintraege.some((e) => e.email === neu.email && ueberschneidet(e, neu))) return 'In diesem Zeitraum bereits eingetragen';
  if (gleichzeitig(eintraege, neu) > MAX_GLEICHZEITIG) return `Höchstens ${MAX_GLEICHZEITIG} Personen gleichzeitig`;
  return null;
}

/** Admins und Mitglieder der in der Rechteverwaltung gewählten Gruppen dürfen alle einteilen. */
export function darfPlanen(r: Rechte, k: Konfiguration): boolean {
  if (r.admin) return true;
  const g = k.bereitschaftGruppen ?? [];
  return r.freigeschaltet && (g.includes(ALLE) || r.gruppen.some((x) => g.includes(x)));
}

export interface PersonStatistik {
  email: string;
  name?: string;
  einsaetze: number;
  wochenenden: number;
  feiertage: number;
  stunden: number;
  naechster?: Einsatz;
}

/** Jahresübersicht pro Person: Einsätze, Wochenenden, Feiertage und Stunden im Jahr (aufs Jahr begrenzt) und der nächste Einsatz. */
export function jahresUebersicht(eintraege: Einsatz[], jahr: number, jetzt: string): PersonStatistik[] {
  const jahrVon = `${jahr}-01-01T00:00`;
  const jahrBis = `${jahr + 1}-01-01T00:00`;
  const ds = dienste(new Date(jahr, 0, 1), new Date(jahr, 11, 31));
  const m = new Map<string, PersonStatistik & { dienstIds: Set<string> }>();
  for (const e of eintraege) {
    let p = m.get(e.email);
    if (!p) m.set(e.email, (p = { email: e.email, einsaetze: 0, wochenenden: 0, feiertage: 0, stunden: 0, dienstIds: new Set() }));
    if (!p.name && e.name) p.name = e.name;
    if (e.bis > jetzt && (!p.naechster || e.von < p.naechster.von)) p.naechster = e;
    if (!ueberschneidet(e, { von: jahrVon, bis: jahrBis })) continue;
    p.einsaetze++;
    const a = e.von > jahrVon ? e.von : jahrVon;
    const b = e.bis < jahrBis ? e.bis : jahrBis;
    p.stunden += (ausText(b).getTime() - ausText(a).getTime()) / 3_600_000;
    for (const d of ds) {
      if (!ueberschneidet(e, d) || p.dienstIds.has(d.id)) continue;
      p.dienstIds.add(d.id);
      if (d.art === 'wochenende') p.wochenenden++;
      else p.feiertage++;
    }
  }
  return [...m.values()]
    .map(({ dienstIds: _d, ...p }) => ({ ...p, stunden: Math.round(p.stunden * 10) / 10 }))
    .filter((p) => p.einsaetze > 0 || p.naechster)
    .sort((a, b) => b.stunden - a.stunden || (a.name ?? a.email).localeCompare(b.name ?? b.email));
}
