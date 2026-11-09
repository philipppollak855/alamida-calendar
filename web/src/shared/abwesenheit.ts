/** Urlaub / Krank / Abwesenheiten. Urlaubskonto in Stunden nach österreichischem Urlaubsgesetz (Arbeitsjahr ab Eintritt). */

import { ALLE, type Konfiguration, type Rechte } from './rechte';
import { ausText, datumText, feiertage, plusTage } from './bereitschaft';

export type AbwArt = 'urlaub' | 'krank' | 'pflege' | 'sonderurlaub' | 'za' | 'sonstiges';
export type AbwStatus = 'beantragt' | 'genehmigt' | 'abgelehnt' | 'gemeldet';

export const ARTEN: Record<AbwArt, { label: string; symbol: string; farbe: string; genehmigung: boolean }> = {
  urlaub: { label: 'Urlaub', symbol: '🌴', farbe: '#f39c12', genehmigung: true },
  krank: { label: 'Krank', symbol: '🤒', farbe: '#e74c3c', genehmigung: false },
  pflege: { label: 'Pflegeurlaub', symbol: '🤝', farbe: '#3498db', genehmigung: true },
  sonderurlaub: { label: 'Sonderurlaub', symbol: '🎗', farbe: '#16a085', genehmigung: true },
  za: { label: 'Zeitausgleich', symbol: '⏱', farbe: '#9b59b6', genehmigung: true },
  sonstiges: { label: 'Sonstiges', symbol: '📌', farbe: '#7f8c8d', genehmigung: true },
};
export const ART_LISTE = Object.keys(ARTEN) as AbwArt[];

export interface Personal {
  email: string;
  name: string;
  gruppe?: string;
  /** JJJJ-MM-TT */
  eintritt: string;
  austritt?: string;
  /** Sollstunden Mo..So */
  tage: number[];
  /** Anrechenbare Vordienstzeiten in Jahren (für 6. Urlaubswoche). */
  vordienstjahre?: number;
  /** Überschreibt die gesetzlichen Urlaubswochen (5 bzw. 6). */
  urlaubswochen?: number;
  /** Übernommener Resturlaub (Stunden) zum Stichtag `saldoAb`, inkl. des dann laufenden Urlaubsjahres; ältere Einträge und Ansprüche zählen dann nicht. */
  urlaubStartSaldo?: number;
  saldoAb?: string;
  /** Urlaub verfällt nicht (wie im alten Programm); Standard: Verfall nach UrlG. */
  ohneVerfall?: boolean;
  ueStartSaldo?: number;
  /** Überstunden zählen ab diesem Monat (JJJJ-MM), davor gilt ueStartSaldo. */
  ueAbMonat?: string;
  ueAusbezahlt?: boolean;
}

export interface Abwesenheit {
  id: string;
  email: string;
  art: AbwArt;
  von: string;
  bis: string;
  /** Nur bei einem einzelnen Tag: stundenweise Abwesenheit. */
  stunden?: number;
  status: AbwStatus;
  notiz?: string;
  beleg?: boolean;
  /** Hochgeladene Bestätigungen (Krankenstand, Pflegeurlaub); die Dateien liegen getrennt im Blob-Store. */
  belege?: Beleg[];
  eingetragenVon?: string;
  erstellt?: number;
  entschieden?: { von: string; am: number; grund?: string };
  /** Zuletzt durch die Verwaltung geändert. */
  geaendert?: { von: string; am: number };
  /** Krank/Pflege „bis auf Weiteres“: läuft bis zur Gesundmeldung, `bis` wird bis heute mitgeführt. */
  offen?: boolean;
  /** Beantragte Verlängerung eines genehmigten Eintrags; der bisherige Zeitraum bleibt genehmigt. */
  verlaengerung?: { bis: string; offen?: boolean; von: string; am: number };
  /** Für Mitarbeiter ohne Verwaltungsrecht: fremde Einträge nur als „abwesend“ (ohne Art und Notiz). */
  verdeckt?: boolean;
  name?: string;
}

export interface Beleg {
  id: string;
  name: string;
  typ: string;
  groesse: number;
  am: number;
  von: string;
}

export const BELEG_ARTEN: AbwArt[] = ['krank', 'pflege'];
export const BELEG_TYPEN = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const BELEG_MAX_BYTES = 4_500_000;
export const BELEG_MAX_ANZAHL = 10;

export const belegMoeglich = (e: Pick<Abwesenheit, 'art' | 'verdeckt'>) => !e.verdeckt && BELEG_ARTEN.includes(e.art);
export const belegFehlt = (e: Pick<Abwesenheit, 'art' | 'status' | 'belege' | 'verdeckt'>) => belegMoeglich(e) && e.status !== 'abgelehnt' && !e.belege?.length;

/** Sicherer Dateiname mit zum Typ passender Endung. */
export function belegDateiname(roh: string, typ: string): string {
  const endung = typ === 'application/pdf' ? 'pdf' : typ === 'image/jpeg' ? 'jpg' : (typ.split('/')[1] ?? 'bin');
  const basis =
    roh
      .replace(/\.[a-z0-9]{1,5}$/i, '')
      .replace(/[^\p{L}\p{N} ._-]+/gu, '')
      .replace(/^[.\s]+/, '')
      .trim()
      .slice(0, 80) || 'Bestaetigung';
  return `${basis}.${endung}`;
}

/** Prüft die ersten Bytes, damit der angegebene Typ zum Inhalt passt. */
export function belegSignaturPasst(b: Uint8Array, typ: string): boolean {
  const ascii = (von: number, bis: number) => String.fromCharCode(...b.slice(von, bis));
  switch (typ) {
    case 'application/pdf':
      return ascii(0, 5) === '%PDF-';
    case 'image/jpeg':
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png':
      return b[0] === 0x89 && ascii(1, 4) === 'PNG';
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'image/heic':
    case 'image/heif':
      return ascii(4, 8) === 'ftyp';
    default:
      return false;
  }
}

export const STANDARD_TAGE = [8, 8, 8, 8, 8, 0, 0];
export const wochenstunden = (p: Pick<Personal, 'tage'>) => p.tage.reduce((s, h) => s + h, 0);
/** Durchschnittliche Stunden je Arbeitstag (Umrechnung Urlaub Stunden ↔ Tage, auch bei Teilzeit). */
export const stundenJeTag = (p: Pick<Personal, 'tage'>) => Math.round((wochenstunden(p) / (p.tage.filter((h) => h > 0).length || 5)) * 100) / 100;
/** Stunden als Arbeitstage, z. B. „12,5 Tage“ / „1 Tag“. */
export function tageAnzeige(stunden: number, proTag: number): string {
  if (!(proTag > 0)) return `${stunden.toLocaleString('de-AT', { maximumFractionDigits: 1 })} h`;
  const t = Math.round((stunden / proTag) * 10) / 10;
  return `${t.toLocaleString('de-AT', { maximumFractionDigits: 1 })} ${Math.abs(t) === 1 ? 'Tag' : 'Tage'}`;
}
export const zaehlt = (a: Pick<Abwesenheit, 'status'>) => a.status === 'genehmigt' || a.status === 'gemeldet';

const ftCache = new Map<number, Set<string>>();
export function istFeiertag(d: string): boolean {
  const j = Number(d.slice(0, 4));
  if (!ftCache.has(j)) ftCache.set(j, new Set(feiertage(j).map((f) => f.datum)));
  return ftCache.get(j)!.has(d);
}

/** Sollstunden eines Tages (0 an Feiertagen und außerhalb des Dienstverhältnisses). */
export function sollStunden(p: Personal, d: string): number {
  if (d < p.eintritt || (p.austritt && d > p.austritt) || istFeiertag(d)) return 0;
  return p.tage[(ausText(d).getDay() + 6) % 7] ?? 0;
}

export function tageListe(von: string, bis: string): string[] {
  const l: string[] = [];
  for (let d = ausText(von); datumText(d) <= bis && l.length < 800; d = plusTage(d, 1)) l.push(datumText(d));
  return l;
}

/** Stunden, die eine Abwesenheit kostet (nur Arbeitstage ohne Feiertage), optional nur im Zeitraum [ab, bis]. */
export function stundenVon(p: Personal, a: Abwesenheit, ab = '0000-01-01', bis = '9999-12-31'): number {
  const tage = tageListe(a.von > ab ? a.von : ab, a.bis < bis ? a.bis : bis);
  const s = tage.reduce((sum, d) => sum + sollStunden(p, d), 0);
  return a.stunden != null && a.von === a.bis ? Math.min(a.stunden, s) : s;
}

export function arbeitstage(p: Personal, a: Abwesenheit): number {
  return tageListe(a.von, a.bis).filter((d) => sollStunden(p, d) > 0).length;
}

const jahrePlus = (d: string, n: number) => {
  const x = ausText(d);
  return datumText(new Date(x.getFullYear() + n, x.getMonth(), x.getDate()));
};
const monatePlus = (d: string, n: number) => {
  const x = ausText(d);
  return datumText(new Date(x.getFullYear(), x.getMonth() + n, x.getDate()));
};

export interface UrlaubsJahr {
  start: string;
  ende: string;
  anspruch: number;
  verbraucht: number;
  verfall: string;
  rest: number;
}

export interface Urlaubskonto {
  jahre: UrlaubsJahr[];
  /** Verfügbarer Resturlaub (Stunden) zum Stichtag. */
  rest: number;
  /** Beantragte oder künftige genehmigte Stunden, die den Rest noch verringern. */
  verplant: number;
  /** Davon künftige genehmigte Urlaube. */
  vorgeplant: number;
  /** Davon offene Anträge. */
  beantragt: number;
  /** Resturlaub nach allen genehmigten (auch künftigen) Urlauben. */
  restGeplant: number;
  /** Stunden, die innerhalb der nächsten 3 Monate verfallen. */
  verfaelltBald: number;
  /** Bezogener Pflegeurlaub im laufenden Arbeitsjahr / Anspruch. */
  pflege: { verbraucht: number; anspruch: number };
  stundenProTag: number;
}

/**
 * Urlaubskonto nach UrlG: Anspruch je Arbeitsjahr = Urlaubswochen × Wochenstunden (5 Wochen, ab 25 Dienstjahren 6).
 * Im ersten Arbeitsjahr entsteht der Anspruch in den ersten 6 Monaten aliquot. Verfall 2 Jahre nach Ende des Urlaubsjahres.
 * Verbrauch zuerst aus dem ältesten noch nicht verfallenen Anspruch.
 */
export function urlaubskonto(p: Personal, abw: Abwesenheit[], stichtag: string): Urlaubskonto {
  const ws = wochenstunden(p);
  const verfallAm = (d: string) => (p.ohneVerfall ? '9999-12-31' : d);
  const eigene = abw.filter((a) => a.email === p.email && a.art === 'urlaub');
  const ab = p.saldoAb && p.saldoAb > p.eintritt ? p.saldoAb : p.eintritt;
  // Der Stichtag selbst ist im übernommenen Resturlaub schon abgezogen.
  const mitSaldo = !!p.saldoAb && p.saldoAb > p.eintritt;
  const abVerbrauch = mitSaldo ? datumText(plusTage(ausText(ab), 1)) : ab;
  const jahre: UrlaubsJahr[] = [];
  if (p.saldoAb && p.saldoAb > p.eintritt) {
    jahre.push({ start: p.saldoAb, ende: p.saldoAb, anspruch: p.urlaubStartSaldo ?? 0, verbraucht: 0, verfall: verfallAm(jahrePlus(p.saldoAb, 2)), rest: 0 });
  }
  for (let n = 0; n < 80; n++) {
    const start = jahrePlus(p.eintritt, n);
    if (start > stichtag || (p.austritt && start > p.austritt)) break;
    const ende = datumText(plusTage(ausText(jahrePlus(p.eintritt, n + 1)), -1));
    // Das beim Stichtag laufende Urlaubsjahr steckt schon im übernommenen Resturlaub.
    if (start < ab || ende < ab) continue;
    const wochen = p.urlaubswochen ?? (n + (p.vordienstjahre ?? 0) >= 25 ? 6 : 5);
    let anspruch = wochen * ws;
    if (n === 0 && stichtag < monatePlus(p.eintritt, 6)) {
      const e0 = ausText(p.eintritt);
      const s0 = ausText(stichtag);
      const monate = Math.max(0, (s0.getFullYear() - e0.getFullYear()) * 12 + s0.getMonth() - e0.getMonth() - (s0.getDate() < e0.getDate() ? 1 : 0));
      anspruch = Math.round(((anspruch * monate) / 12) * 100) / 100;
    }
    jahre.push({ start, ende, anspruch, verbraucht: 0, verfall: verfallAm(datumText(plusTage(ausText(jahrePlus(ende, 2)), 1))), rest: 0 });
  }
  // Verbrauch chronologisch zuordnen (genehmigt, bis Stichtag)
  const tage = eigene
    .filter((a) => a.status === 'genehmigt')
    .flatMap((a) => tageListe(a.von, a.bis).map((d) => ({ d, h: a.stunden != null && a.von === a.bis ? Math.min(a.stunden, sollStunden(p, d)) : sollStunden(p, d) })))
    .filter((x) => x.h > 0 && (mitSaldo ? x.d > ab : x.d >= ab) && x.d <= stichtag)
    .sort((x, y) => x.d.localeCompare(y.d));
  let ueberzogen = 0;
  for (const { d, h } of tage) {
    let offen = h;
    for (const j of jahre) {
      if (offen <= 0) break;
      if (j.start > d || j.verfall <= d) continue;
      const frei = j.anspruch - j.verbraucht;
      const nimm = Math.min(frei, offen);
      if (nimm > 0) {
        j.verbraucht += nimm;
        offen -= nimm;
      }
    }
    ueberzogen += offen;
  }
  for (const j of jahre) j.rest = Math.round((j.anspruch - j.verbraucht) * 100) / 100;
  const gueltig = jahre.filter((j) => j.verfall > stichtag);
  const rest = Math.round((gueltig.reduce((s, j) => s + j.rest, 0) - ueberzogen) * 100) / 100;
  const in3 = monatePlus(stichtag, 3);
  const morgen = datumText(plusTage(ausText(stichtag), 1));
  const ab0 = abVerbrauch > morgen ? abVerbrauch : morgen;
  const vorgeplant = eigene.filter((a) => a.status === 'genehmigt' && a.bis >= ab0).reduce((s, a) => s + stundenVon(p, a, ab0), 0);
  const beantragt = eigene.filter((a) => a.status === 'beantragt' && a.bis >= abVerbrauch).reduce((s, a) => s + stundenVon(p, a, abVerbrauch), 0);
  const verplant = vorgeplant + beantragt;
  const aktJahr = [...jahre].reverse().find((j) => j.start <= stichtag && j.ende >= stichtag && j.start !== j.ende);
  const pflegeVerbraucht = aktJahr
    ? abw.filter((a) => a.email === p.email && a.art === 'pflege' && zaehlt(a)).reduce((s, a) => s + stundenVon(p, a, aktJahr.start, aktJahr.ende), 0)
    : 0;
  const arbeitstageProWoche = p.tage.filter((h) => h > 0).length || 5;
  return {
    jahre,
    rest,
    verplant: Math.round(verplant * 100) / 100,
    vorgeplant: Math.round(vorgeplant * 100) / 100,
    beantragt: Math.round(beantragt * 100) / 100,
    restGeplant: Math.round((rest - vorgeplant) * 100) / 100,
    verfaelltBald: Math.round(gueltig.filter((j) => j.verfall <= in3).reduce((s, j) => s + j.rest, 0) * 100) / 100,
    pflege: { verbraucht: pflegeVerbraucht, anspruch: ws },
    stundenProTag: Math.round((ws / arbeitstageProWoche) * 100) / 100,
  };
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
export const gueltigesDatum = (s: string) => DATUM.test(s) && datumText(ausText(s)) === s;

export function abwesenheitFehler(a: Pick<Abwesenheit, 'art' | 'von' | 'bis' | 'stunden'>): string | null {
  if (!ART_LISTE.includes(a.art)) return 'Unbekannte Art';
  if (!gueltigesDatum(a.von) || !gueltigesDatum(a.bis) || a.von > a.bis) return 'Ungültiger Zeitraum';
  if (tageListe(a.von, a.bis).length > 366) return 'Höchstens ein Jahr am Stück';
  if (a.stunden != null && (a.von !== a.bis || !(a.stunden > 0 && a.stunden <= 24))) return 'Stundenweise nur für einen einzelnen Tag (0–24 h)';
  return null;
}

export const ueberschneidet = (a: { von: string; bis: string }, b: { von: string; bis: string }) => a.von <= b.bis && b.von <= a.bis;

/** Arten, die „bis auf Weiteres“ (bis zur Gesundmeldung) laufen können. */
export const OFFEN_ARTEN: AbwArt[] = ['krank', 'pflege'];
/** Wartet auf eine Entscheidung: offener Antrag oder beantragte Verlängerung. */
export const wartet = (e: Pick<Abwesenheit, 'status' | 'verlaengerung'>) => e.status === 'beantragt' || !!e.verlaengerung;
export const heuteWien = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });

/** Offene Einträge („bis auf Weiteres“) laufen bis heute. */
export function laufendBis<T extends Pick<Abwesenheit, 'offen' | 'bis' | 'status'>>(e: T, heute: string): T {
  return e.offen && e.status !== 'abgelehnt' && e.bis < heute ? { ...e, bis: heute } : e;
}

/** Verlängern, „bis auf Weiteres“ setzen oder gesund melden – ohne neuen Antrag. */
export function verlaengernFehler(
  e: Pick<Abwesenheit, 'email' | 'art' | 'von' | 'bis' | 'stunden' | 'status' | 'offen' | 'verdeckt'>,
  neu: { bis: string; offen?: boolean },
  verwalter: boolean,
  ich: string,
): string | null {
  if (e.verdeckt || (!verwalter && e.email !== ich)) return 'Du darfst nur eigene Einträge verlängern';
  if (e.status === 'abgelehnt') return 'Abgelehnte Einträge können nicht verlängert werden';
  if (e.stunden != null) return 'Stundenweise Einträge können nicht verlängert werden';
  if (neu.offen && !OFFEN_ARTEN.includes(e.art)) return '„Bis auf Weiteres“ gibt es nur bei Krankenstand und Pflegeurlaub';
  const f = abwesenheitFehler({ art: e.art, von: e.von, bis: neu.bis });
  if (f) return f;
  if (!verwalter && e.art !== 'krank' && !e.offen && !neu.offen && neu.bis <= e.bis) return 'Das neue Ende muss nach dem bisherigen liegen';
  return null;
}

/** Admins und Mitglieder der in der Rechteverwaltung gewählten Gruppen genehmigen und sehen alles. */
export function darfVerwalten(r: Rechte, k: Konfiguration): boolean {
  if (r.admin) return true;
  const g = k.abwesenheitGruppen ?? [];
  return r.freigeschaltet && (g.includes(ALLE) || r.gruppen.some((x) => g.includes(x)));
}

export function personalPruefen(x: unknown): Personal[] {
  if (!Array.isArray(x)) return [];
  const t = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined);
  const gesehen = new Set<string>();
  return x
    .map((o: Record<string, unknown>) => {
      const tage = Array.isArray(o?.tage) && o.tage.length === 7 ? o.tage.map((h) => Math.max(0, Math.min(24, Number(h) || 0))) : STANDARD_TAGE;
      const p: Personal = {
        email: t(o?.email, 200).toLowerCase(),
        name: t(o?.name) || t(o?.email),
        eintritt: gueltigesDatum(t(o?.eintritt)) ? t(o?.eintritt) : '2024-01-01',
        tage,
      };
      if (t(o?.gruppe)) p.gruppe = t(o?.gruppe);
      if (gueltigesDatum(t(o?.austritt))) p.austritt = t(o?.austritt);
      if (n(o?.vordienstjahre)) p.vordienstjahre = n(o?.vordienstjahre);
      if (n(o?.urlaubswochen)) p.urlaubswochen = n(o?.urlaubswochen);
      if (gueltigesDatum(t(o?.saldoAb))) {
        p.saldoAb = t(o?.saldoAb);
        p.urlaubStartSaldo = n(o?.urlaubStartSaldo) ?? 0;
      }
      if (n(o?.ueStartSaldo) != null) p.ueStartSaldo = n(o?.ueStartSaldo);
      if (o?.ueAusbezahlt === true) p.ueAusbezahlt = true;
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(t(o?.ueAbMonat))) p.ueAbMonat = t(o?.ueAbMonat);
      if (o?.ohneVerfall === true) p.ohneVerfall = true;
      return p;
    })
    .filter((p) => p.email.includes('@') && !gesehen.has(p.email) && gesehen.add(p.email));
}

/** Mitarbeiter ohne E-Mail (PIN-Konten im Hub, intern angelegte) haben eine Adresse unter dieser Domain. */
export const OHNE_EMAIL_DOMAIN = 'pin.invalid';
export const istOhneEmail = (email: string) => email.trim().toLowerCase().endsWith(`@${OHNE_EMAIL_DOMAIN}`);

const kennung = (x: string) =>
  x
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Interne Adresse für Personal ohne E-Mail, z. B. „maria-huber-alt7@pin.invalid“. */
export const internesKonto = (name: string, id: string) =>
  `${kennung(name).slice(0, 30) || 'mitarbeiter'}-alt${kennung(id).slice(0, 12) || '0'}@${OHNE_EMAIL_DOMAIN}`;

/** Neu zugeordnete Konten aus den Stammdaten (Feld „vorher“ = bisher gespeicherte Adresse) → alt ⇒ neu. */
export function umbenennungen(x: unknown): Map<string, string> {
  const m = new Map<string, string>();
  if (!Array.isArray(x)) return m;
  for (const o of x as Record<string, unknown>[]) {
    const alt = typeof o?.vorher === 'string' ? o.vorher.trim().toLowerCase() : '';
    const neu = typeof o?.email === 'string' ? o.email.trim().toLowerCase() : '';
    if (alt && neu.includes('@') && alt !== neu) m.set(alt, neu);
  }
  return m;
}

/* ---------- Import aus dem bisherigen Programm (gu_stunden.py, personal_daten.json) ---------- */

const ALT_ART: Record<string, AbwArt> = { Urlaub: 'urlaub', Krank: 'krank', Pflegeurlaub: 'pflege', Zeitausgleich: 'za' };

export interface AltMitarbeiter {
  mId: string;
  name: string;
  gruppe?: string;
  personal: Omit<Personal, 'email'>;
  abwesenheiten: Pick<Abwesenheit, 'art' | 'von' | 'bis' | 'status'>[];
  /** Resturlaub laut altem Programm (Tage, inkl. bereits eingetragener künftiger Urlaube). */
  altRestTage: number;
}

const istWerktag = (d: string) => {
  const w = ausText(d).getDay();
  return w !== 0 && w !== 6 && !istFeiertag(d);
};

/** Fasst Einzeltage gleicher Art zu Zeiträumen zusammen; Wochenenden/Feiertage dazwischen unterbrechen nicht. */
export function tageZuZeitraeumen(tage: string[]): { von: string; bis: string }[] {
  const s = [...new Set(tage)].filter(gueltigesDatum).sort();
  const out: { von: string; bis: string }[] = [];
  for (const d of s) {
    const letzt = out[out.length - 1];
    if (letzt) {
      const luecke = tageListe(datumText(plusTage(ausText(letzt.bis), 1)), datumText(plusTage(ausText(d), -1)));
      if (luecke.length <= 4 && luecke.every((x) => !istWerktag(x))) {
        letzt.bis = d;
        continue;
      }
    }
    out.push({ von: d, bis: d });
  }
  return out;
}

/**
 * Liest die Datei des alten Programms. Der Resturlaub wird zum Stichtag als Start-Saldo übernommen
 * (künftige Urlaube werden wieder dazugerechnet, weil das neue Konto sie selbst abzieht).
 */
export function altdatenLesen(x: unknown, stichtag: string): AltMitarbeiter[] {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const ma = (o.mitarbeiter && typeof o.mitarbeiter === 'object' ? o.mitarbeiter : {}) as Record<string, Record<string, unknown>>;
  const abwAlle = (o.abwesenheiten && typeof o.abwesenheiten === 'object' ? o.abwesenheiten : {}) as Record<string, Record<string, string>>;
  const zuordnung = (o.ma_zuordnung && typeof o.ma_zuordnung === 'object' ? o.ma_zuordnung : {}) as Record<string, string>;
  const eintraege = Array.isArray(o.eintraege) ? (o.eintraege as Record<string, unknown>[]) : [];
  const zahl = (v: unknown, d: number) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return isFinite(n) ? n : d;
  };
  return Object.entries(ma).map(([mId, m]) => {
    const soll = Math.max(0, Math.min(24, zahl(m.sollstunden, 8)));
    const anspruch = zahl(m.anspruch, 25);
    const eintritt = gueltigesDatum(String(m.eintritt ?? '')) ? String(m.eintritt) : '2024-01-01';
    const personal: Omit<Personal, 'email'> = { name: String(m.name ?? '').trim() || mId, eintritt, tage: [soll, soll, soll, soll, soll, 0, 0] };
    if (gueltigesDatum(String(m.austritt ?? ''))) personal.austritt = String(m.austritt);
    if (anspruch !== 25 && anspruch > 0) personal.urlaubswochen = Math.round((anspruch / 5) * 100) / 100;
    if (zahl(m.ue_start_saldo, 0)) personal.ueStartSaldo = zahl(m.ue_start_saldo, 0);
    if (m.ue_ausbezahlt === true) personal.ueAusbezahlt = true;
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(m.ue_ab_monat ?? ''))) personal.ueAbMonat = String(m.ue_ab_monat);
    if (zuordnung[mId] && zuordnung[mId] !== 'Standard') personal.gruppe = zuordnung[mId];

    const nachArt = new Map<AbwArt, string[]>();
    for (const [d, typ] of Object.entries(abwAlle[mId] ?? {})) {
      const art = ALT_ART[typ];
      if (art) nachArt.set(art, [...(nachArt.get(art) ?? []), d]);
    }
    const abwesenheiten = [...nachArt].flatMap(([art, tage]) =>
      tageZuZeitraeumen(tage).map((z) => ({ art, ...z, status: (art === 'krank' ? 'gemeldet' : 'genehmigt') as AbwStatus })),
    );

    // Resturlaub wie im alten Programm: (volle Dienstjahre + 1) × Anspruch − manuelle − Kalender-Urlaubstage
    const e = ausText(eintritt);
    const h = ausText(stichtag);
    let jahre = h.getFullYear() - e.getFullYear();
    if (h.getMonth() < e.getMonth() || (h.getMonth() === e.getMonth() && h.getDate() < e.getDate())) jahre--;
    const urlaubTage = Object.entries(abwAlle[mId] ?? {}).filter(([d, t]) => t === 'Urlaub' && gueltigesDatum(d) && istWerktag(d)).map(([d]) => d);
    const manuell = eintraege.filter((x) => String(x.m_id) === mId).reduce((s2, x) => s2 + zahl(x.ur, 0), 0);
    const altRestTage = (Math.max(0, jahre) + 1) * anspruch - manuell - urlaubTage.length;
    const kuenftig = urlaubTage.filter((d) => d > stichtag).length;
    personal.saldoAb = stichtag;
    personal.ohneVerfall = true;
    personal.urlaubStartSaldo = Math.round((altRestTage + kuenftig) * soll * 100) / 100;
    return { mId, name: personal.name, gruppe: personal.gruppe, personal, abwesenheiten, altRestTage };
  });
}
