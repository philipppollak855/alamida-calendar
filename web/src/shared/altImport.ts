import { istFeiertag, stundenJeTag, type AbwArt, type AbwStatus, type Personal } from './abwesenheit';
import { ausText, datumText, plusTage } from './bereitschaft';

/** Kürzel aus dem Excel-An-/Abwesenheitsplaner (Blatt „Annahmen“). B (Bereitschaft) und Schichtkürzel sind keine Abwesenheit. */
export const EXCEL_KUERZEL: Record<string, { art: AbwArt; status: AbwStatus; halb?: boolean; notiz?: string }> = {
  U: { art: 'urlaub', status: 'genehmigt' },
  UV: { art: 'urlaub', status: 'beantragt' },
  H: { art: 'urlaub', status: 'genehmigt', halb: true },
  HV: { art: 'urlaub', status: 'beantragt', halb: true },
  SU: { art: 'sonderurlaub', status: 'genehmigt' },
  K: { art: 'krank', status: 'gemeldet' },
  KH: { art: 'krank', status: 'gemeldet', halb: true },
  F: { art: 'za', status: 'genehmigt', notiz: 'Freier Tag' },
  FV: { art: 'za', status: 'beantragt', notiz: 'Freier Tag' },
  FB: { art: 'sonstiges', status: 'genehmigt', notiz: 'Fortbildung' },
  E: { art: 'sonstiges', status: 'genehmigt', notiz: 'Elternzeit' },
  S: { art: 'sonstiges', status: 'genehmigt' },
};

export interface ImportAbwesenheit {
  art: AbwArt;
  von: string;
  bis: string;
  status: AbwStatus;
  stunden?: number;
  notiz: string;
}

/** Excel-Seriennummer → JJJJ-MM-TT. */
export const excelDatum = (n: number) => datumText(plusTage(new Date(1899, 11, 30), Math.floor(n)));

/** Liegen zwischen zwei Tagen nur Wochenenden/Feiertage? */
function nurFrei(bis: string, datum: string): boolean {
  for (let d = plusTage(ausText(bis), 1); datumText(d) < datum; d = plusTage(d, 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6 && !istFeiertag(datumText(d))) return false;
  }
  return true;
}

/** Tageskürzel einer Person zu zusammenhängenden Abwesenheiten zusammenfassen (Wochenenden/Feiertage überbrücken). */
export function tageZuAbwesenheiten(tage: { datum: string; code: string }[], p?: Pick<Personal, 'tage'>, herkunft = 'Import aus Excel-Abwesenheitsplaner'): ImportAbwesenheit[] {
  const out: (ImportAbwesenheit & { k?: string })[] = [];
  let akt: (ImportAbwesenheit & { k?: string }) | null = null;
  for (const t of [...tage].sort((a, b) => a.datum.localeCompare(b.datum))) {
    const k = EXCEL_KUERZEL[t.code.trim().toUpperCase()];
    if (!k) continue;
    const notiz = k.notiz ? `${herkunft}: ${k.notiz}` : herkunft;
    if (k.halb) {
      const proTag = p ? stundenJeTag(p) : 8;
      out.push({ art: k.art, von: t.datum, bis: t.datum, status: k.status, stunden: Math.round(((proTag > 0 ? proTag : 8) / 2) * 100) / 100, notiz });
      akt = null;
      continue;
    }
    const schl = `${k.art}|${k.status}|${notiz}`;
    if (akt && akt.k === schl && nurFrei(akt.bis, t.datum)) akt.bis = t.datum;
    else out.push((akt = { art: k.art, von: t.datum, bis: t.datum, status: k.status, notiz, k: schl }));
  }
  return out.map(({ k: _k, ...x }) => x);
}

export interface BerichtZeile {
  name: string;
  gruppe: string;
  ue: number;
  ueAusb: number;
  kr: number;
  ur: number;
  so: number;
}

const zahl = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100) / 100 || 0;
const Z = '(-?\\d+(?:[.,]\\d+)?)';
const KURZ = new RegExp(`^(.+?)\\s+(\\d{1,2})\\s+${Z}\\s+${Z}\\s+${Z}\\s+${Z}$`);
const LANG = new RegExp(`^(.+?)\\s+(\\d{1,2})\\s+${Z}\\s+${Z}\\s+${Z}\\s+${Z}\\s+${Z}\\s+${Z}\\s+${Z}$`);

/**
 * Textzeilen eines Monatsberichts (PDF) lesen. Alt: Name | Mon. | Ü-Std | Kr. | Ur. | So.
 * Neu: Name | Mon. | Ü-Übertrag | Ü-Neu | Ü-Ausz. | Ü-Saldo | Kr. | Ur. | So.
 */
export function berichtLesen(zeilen: string[]): { monat: string | null; zeilen: BerichtZeile[] } {
  let monat: string | null = null;
  let gruppe = '';
  const out: BerichtZeile[] = [];
  for (const roh of zeilen) {
    const z = roh.replace(/\s+/g, ' ').trim();
    const m = /Monatsbericht\s+(\d{1,2})\s*\/\s*(\d{4})/i.exec(z);
    if (m) {
      monat ??= `${m[2]}-${m[1].padStart(2, '0')}`;
      continue;
    }
    const g = /^Gruppe:\s*(.+)$/i.exec(z);
    if (g) {
      gruppe = g[1].trim();
      continue;
    }
    if (/^Name\b/i.test(z)) continue;
    const l = LANG.exec(z);
    if (l) {
      out.push({ name: l[1].trim(), gruppe, ue: zahl(l[4]), ueAusb: zahl(l[5]), kr: zahl(l[7]), ur: zahl(l[8]), so: zahl(l[9]) });
      continue;
    }
    const k = KURZ.exec(z);
    if (k) out.push({ name: k[1].trim(), gruppe, ue: zahl(k[3]), ueAusb: 0, kr: zahl(k[4]), ur: zahl(k[5]), so: zahl(k[6]) });
  }
  return { monat, zeilen: out };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

/** Alten Namen einem Konto zuordnen, auch bei vertauschter Reihenfolge („Fuchsjäger Jürgen“). */
export function nameZuordnen(name: string, personal: Pick<Personal, 'email' | 'name'>[]): string {
  const n = norm(name);
  return personal.find((p) => p.name && norm(p.name) === n)?.email ?? '';
}
