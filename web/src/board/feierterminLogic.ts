import type { Sterbefall } from '../types';
import { isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import { dayKeyFromDeDatum, extractDeDatum, extractZeitDe, parseDatumDe } from './dateUtils';
import { istImAnschluss, sterbefallImAnschluss } from './historieLogic';
import { istKrematorium } from './ortKeywords';

/** S = Sarg (ohne Kremation), U = Urne (mit Kremation im Ablauf). */
export type BestattungsMarker = 'S' | 'U';

function istOffenerKremationsschritt(a: {
  schrittTyp?: string;
  status?: string;
  terminAm?: string;
  abholungAm?: string;
}): boolean {
  if (a.schrittTyp !== 'kremation') return false;
  if (a.status === 'abholung_noetig') return true;
  return isAusstehendHeuteOrGeplant(a);
}

/**
 * Kremation abgeschlossen: kein offener Kremationsschritt und Termin im Verlauf ≤ heute.
 * (Verlauf enthält auch geplante Schritte — nicht jede Kremationszeile = erledigt.)
 */
export function istKremationErledigt(s: Sterbefall, now: Date = new Date()): boolean {
  if ((s.ausstehend ?? []).some(istOffenerKremationsschritt)) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return (s.verlauf ?? []).some((v) => {
    if ((v.typ ?? '').toLowerCase() !== 'kremation') return false;
    const raw = v.terminAm ?? v.abholungAm;
    if (!raw?.trim()) return false;
    const ms = parseDatumDe(raw);
    if (ms === Number.MAX_SAFE_INTEGER) return false;
    const day = new Date(ms);
    day.setHours(0, 0, 0, 0);
    return day.getTime() <= today;
  });
}

/** Kremation mit erkennbarem Termindatum (ausstehend oder nächster Schritt). */
export function findeKremationTermin(s: Sterbefall): string | undefined {
  const ausstehend = (s.ausstehend ?? []).find(istOffenerKremationsschritt);
  const t = ausstehend?.terminAm?.trim() || ausstehend?.abholungAm?.trim();
  if (t && extractDeDatum(t)) return t;
  if (s.naechsterSchrittTyp === 'kremation') {
    const n = s.naechsterSchrittAm?.trim();
    if (n && extractDeDatum(n)) return n;
  }
  return undefined;
}

/** Kremation geplant, offen oder bereits im Verlauf (Kühlraum-Chip „Kremation“). */
export function hatKremationImSterbefall(s: Sterbefall): boolean {
  if ((s.ausstehend ?? []).some(istOffenerKremationsschritt)) return true;
  if (istKremationErledigt(s)) return true;
  if (s.naechsterSchrittTyp === 'kremation') return true;
  if (s.endzielTyp === 'kremation') return true;
  if (s.endziel?.trim() && istKrematorium(s.endziel)) return true;
  return false;
}

/** Kremation mit Termin am oder vor dem Feiertag (Urnenweg). */
function kremationTerminVorFeier(s: Sterbefall, feierDayKey: string | null): boolean {
  if (!feierDayKey) return false;

  const kremTermin = findeKremationTermin(s);
  if (kremTermin) {
    const krDay = dayKeyFromDeDatum(kremTermin);
    if (krDay && krDay < feierDayKey) return true;
  }

  for (const v of s.verlauf ?? []) {
    if ((v.typ ?? '').toLowerCase() !== 'kremation') continue;
    const raw = v.terminAm ?? v.abholungAm;
    const krDay = dayKeyFromDeDatum(raw);
    if (krDay && krDay < feierDayKey) return true;
  }

  return false;
}

/** U auf Feiertermin: Kremation erledigt oder Urnenweg (Kremation vor/am Feiertag). */
export function hatUrnenMarkerAufFeier(
  s: Sterbefall,
  feierDayKey: string | null,
  now: Date = new Date()
): boolean {
  if (istKremationErledigt(s, now)) return true;
  return kremationTerminVorFeier(s, feierDayKey);
}

function feierDayKeyFromEntry(s: Sterbefall, arts: readonly string[], title: string): string | null {
  if (title === 'Trauerfeier 2' || arts.includes('trauerfeier2')) {
    return dayKeyFromDeDatum(s.trauerfeier2datum);
  }
  return dayKeyFromDeDatum(s.trauerfeierdatum);
}

/**
 * S/U auf Feierterminen: Beisetzung U bei jeder Kremation im Ablauf, sonst S.
 * Trauerfeier/Verabschiedung: U bei Urnenfeier oder Urnenweg (Kremation vor/am Feiertag).
 */
function hatKremationFuerBestattungsMarker(
  s: Sterbefall,
  arts: readonly string[],
  title: string
): boolean {
  if (entryHatTrauerfeierOderVerabschiedung(arts, title)) {
    return hatUrnenMarkerAufFeier(s, feierDayKeyFromEntry(s, arts, title));
  }
  if (entryHatBeisetzung(arts, title)) return hatKremationImSterbefall(s);
  if (istKremationErledigt(s)) return true;
  return Boolean(findeKremationTermin(s));
}

/** S/U auf Kühlraum-Chips (ohne Kalender-Gruppierung). */
export function kuehlraumBestattungsMarker(
  s: Sterbefall,
  kind: 'trauerfeier' | 'verabschiedung' | 'beisetzung',
  now: Date = new Date(),
  feierDatum?: string
): BestattungsMarker {
  if (kind === 'beisetzung') return hatKremationImSterbefall(s) ? 'U' : 'S';
  const feierDay = dayKeyFromDeDatum(feierDatum ?? s.trauerfeierdatum);
  return hatUrnenMarkerAufFeier(s, feierDay, now) ? 'U' : 'S';
}

const FEIER_MARKER_ARTS = new Set([
  'trauerfeier',
  'verabschiedung',
  'trauerfeier2',
  'beisetzung',
  'rosenkranz',
]);

function entryHatTrauerfeierOderVerabschiedung(arts: readonly string[], title: string): boolean {
  if (title === 'Trauerfeier' || title === 'Verabschiedung' || title === 'Trauerfeier 2') return true;
  return arts.some((a) => a === 'trauerfeier' || a === 'verabschiedung' || a === 'trauerfeier2');
}

function entryHatBeisetzung(arts: readonly string[], title: string): boolean {
  return title === 'Beisetzung' || arts.includes('beisetzung');
}

/** Kalender/Kühlraum: markanter S/U-Hinweis auf Feierterminen. */
export function calendarBestattungsMarker(
  s: Sterbefall,
  arts: readonly string[],
  title: string
): BestattungsMarker | undefined {
  if (!arts.some((a) => FEIER_MARKER_ARTS.has(a))) return undefined;

  const kremation = hatKremationFuerBestattungsMarker(s, arts, title);
  const tfOderVerabschiedung = entryHatTrauerfeierOderVerabschiedung(arts, title);
  const beisetzung = entryHatBeisetzung(arts, title);

  if (!tfOderVerabschiedung && !beisetzung) return undefined;
  return kremation ? 'U' : 'S';
}

/** Bei „Im Anschluss“ keine Uhrzeit aus dem Beisetzungs-Datumtext übernehmen (Sync-Artefakt). */
export function beisetzungsZeitAusSterbefall(s: Sterbefall): string | undefined {
  if (sterbefallImAnschluss(s)) {
    return extractZeitDe(undefined, s.beisetzungszeit);
  }
  return extractZeitDe(s.beisetzungsdatum, s.beisetzungszeit);
}

export function beisetzungZeitGleichTrauerfeier(s: Sterbefall): boolean {
  const tf = extractZeitDe(s.trauerfeierdatum, s.trauerfeierzeit);
  const bs = beisetzungsZeitAusSterbefall(s);
  return Boolean(tf && bs && tf === bs);
}

/** Beisetzung mit abweichender Uhrzeit (nicht Im Anschluss, nicht gleiche Zeit wie Trauerfeier). */
export function beisetzungHatEigeneUhrzeit(s: Sterbefall): boolean {
  if (istImAnschluss(s.beisetzungszeit)) return false;
  const bs = beisetzungsZeitAusSterbefall(s);
  if (!bs) return false;
  if (beisetzungZeitGleichTrauerfeier(s)) return false;
  return true;
}

/** Beisetzung gehört zur Trauerfeier (Im Anschluss oder gleiche Uhrzeit am Trauerfeier-Tag). */
export function beisetzungImAnschlussAmTrauerfeierTag(s: Sterbefall): boolean {
  if (beisetzungHatEigeneUhrzeit(s)) return false;
  const tfDay = dayKeyFromDeDatum(s.trauerfeierdatum);
  if (!tfDay) return false;
  const bsDay = dayKeyFromDeDatum(s.beisetzungsdatum);
  if (bsDay && bsDay !== tfDay) return false;
  return sterbefallImAnschluss(s) || beisetzungZeitGleichTrauerfeier(s);
}

/** Eigener Beisetzungs-Marker (anderer Tag oder andere Uhrzeit). */
export function beisetzungAlsEigenerTermin(s: Sterbefall): boolean {
  if (!extractDeDatum(s.beisetzungsdatum)) return false;
  return !beisetzungImAnschlussAmTrauerfeierTag(s);
}

export function rosenkranzUndTrauerfeier1AmSelbenTag(s: Sterbefall): boolean {
  const rkDay = dayKeyFromDeDatum(s.rosenkranzdatum);
  const tfDay = dayKeyFromDeDatum(s.trauerfeierdatum);
  return Boolean(rkDay && tfDay && rkDay === tfDay);
}

/**
 * Erster Feiertermin: „Verabschiedung“ bei Rosenkranz am selben Tag oder Urnenweg
 * (Kremation/Beisetzung später, noch kein eigener Beisetzungstermin).
 */
export function trauerfeier1AlsVerabschiedung(s: Sterbefall): boolean {
  if (!extractDeDatum(s.trauerfeierdatum)) return false;
  if (rosenkranzUndTrauerfeier1AmSelbenTag(s)) return true;
  if (!hatKremationImSterbefall(s)) return false;
  return !beisetzungAlsEigenerTermin(s);
}
