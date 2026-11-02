import type { Sterbefall } from '../types';
import { schrittTypLabel } from '../types';
import {
  addDays,
  dayKeyFromDate,
  dayKeyFromDeDatum,
  extractDeDatum,
  extractZeitDe,
  formatDayLabelDe,
  formatZeitDe,
  parseDatumZeitDe,
  startOfWeekMonday,
} from './dateUtils';
import {
  beisetzungImAnschlussAmTrauerfeierTag,
  calendarBestattungsMarker,
  type BestattungsMarker,
  trauerfeier1AlsVerabschiedung,
} from './feierterminLogic';
import { filterSterbefaelleFuerKalender, sterbefallImAnschluss } from './historieLogic';

export type WallCalendarRange = 7 | 14 | 'month';

export type CalendarTerminArt =
  | 'aufnahme'
  | 'rosenkranz'
  | 'verabschiedung'
  | 'trauerfeier'
  | 'trauerfeier2'
  | 'beisetzung'
  | 'ueberfuehrung'
  | 'ueberfuehrung_kremation'
  | 'trauerblock';

/** Farbgruppen im Kalender (Filter bleiben bei den sichtbaren Terminarten). */
export type CalendarColorGroup = 'fahrt' | 'kremation' | 'feier' | 'aufnahme';

export function calendarColorGroupFromArts(arts: readonly CalendarTerminArt[]): CalendarColorGroup {
  if (arts.some((a) => a === 'aufnahme')) return 'aufnahme';
  if (arts.some((a) => a === 'ueberfuehrung_kremation')) return 'kremation';
  if (arts.some((a) => a === 'ueberfuehrung')) return 'fahrt';
  return 'feier';
}

function calendarArtFromSchritt(schrittTyp?: string): CalendarTerminArt {
  const typ = (schrittTyp ?? '').trim().toLowerCase();
  if (typ === 'kremation') return 'ueberfuehrung_kremation';
  return 'ueberfuehrung';
}

function artMatchesFilter(art: CalendarTerminArt, activeArts: ReadonlySet<CalendarTerminArt>): boolean {
  if (activeArts.has(art)) return true;
  if (art === 'ueberfuehrung_kremation' && activeArts.has('ueberfuehrung')) return true;
  return false;
}

export const ALL_CALENDAR_TERMIN_ARTEN: CalendarTerminArt[] = [
  'aufnahme',
  'rosenkranz',
  'verabschiedung',
  'trauerfeier',
  'trauerfeier2',
  'beisetzung',
  'ueberfuehrung',
  'trauerblock',
];

export const CALENDAR_TERMIN_ART_LABELS: Record<CalendarTerminArt, string> = {
  aufnahme: 'Aufnahme',
  rosenkranz: 'Rosenkranz',
  verabschiedung: 'Verabschiedung',
  trauerfeier: 'Trauerfeier',
  trauerfeier2: 'Trauerfeier 2',
  beisetzung: 'Beisetzung',
  ueberfuehrung: 'Überführung',
  ueberfuehrung_kremation: 'Ins Krematorium',
  trauerblock: 'Trauerblock',
};

export function isCalendarFilterComplete(activeArts: ReadonlySet<CalendarTerminArt>): boolean {
  return ALL_CALENDAR_TERMIN_ARTEN.every((a) => activeArts.has(a));
}

export function isCalendarTerminArt(v: unknown): v is CalendarTerminArt {
  return typeof v === 'string' && ALL_CALENDAR_TERMIN_ARTEN.includes(v as CalendarTerminArt);
}

/** Mehrfachfilter: Eintrag sichtbar, wenn mindestens eine seiner Arten aktiv ist. */
export function filterEntriesByArts(
  entries: WallCalendarEntry[],
  activeArts: ReadonlySet<CalendarTerminArt>
): WallCalendarEntry[] {
  if (activeArts.size === 0) return [];
  if (isCalendarFilterComplete(activeArts)) return entries;
  return entries.filter((e) => e.arts.some((a) => artMatchesFilter(a, activeArts)));
}

interface AtomicTermin {
  key: string;
  art: CalendarTerminArt;
  label: string;
  dayKey: string;
  sortMs: number;
  zeit?: string;
  ort?: string;
  route?: string;
}

export interface WallCalendarEntry {
  id: string;
  docId: string;
  sterbefallId: string;
  dayKey: string;
  dayLabel: string;
  timeLabel: string;
  sortMs: number;
  name: string;
  title: string;
  subtitle: string;
  badges: string[];
  grouped: boolean;
  arts: CalendarTerminArt[];
  searchText: string;
  /** S = ohne Kremation, U = mit Kremation im Ablauf */
  bestattungsMarker?: BestattungsMarker;
}

export interface WallCalendarDay {
  dayKey: string;
  dayLabel: string;
  weekdayShort: string;
  isToday: boolean;
  isWeekend: boolean;
  entries: WallCalendarEntry[];
}

function fallName(s: Sterbefall): string {
  return (
    s.verstorbenerName?.trim() ||
    [s.verstorbenerVorname, s.verstorbenerNachname].filter(Boolean).join(' ') ||
    s.sterbefallId ||
    s.id
  );
}

function pushAtomic(
  list: AtomicTermin[],
  s: Sterbefall,
  art: CalendarTerminArt,
  label: string,
  rawDatum?: string,
  rawZeit?: string,
  ort?: string,
  route?: string
) {
  const datum = extractDeDatum(rawDatum);
  if (!datum) return;
  const zeit = extractZeitDe(rawDatum, rawZeit);
  const dayKey = dayKeyFromDeDatum(datum);
  if (!dayKey) return;
  const sortMs = parseDatumZeitDe(datum, zeit) ?? parseDatumZeitDe(datum, undefined, true)!;
  list.push({
    key: `${s.id}:${art}:${dayKey}:${zeit ?? ''}`,
    art,
    label,
    dayKey,
    sortMs,
    zeit: zeit || undefined,
    ort: ort?.trim() || undefined,
    route: route?.trim() || undefined,
  });
}

function collectAtomics(s: Sterbefall): AtomicTermin[] {
  const atoms: AtomicTermin[] = [];
  const seen = new Set<string>();
  const name = fallName(s);

  const ueberfuehrungKey = (
    datum?: string,
    schrittTyp?: string,
    von?: string,
    nach?: string,
    ort?: string
  ): string | null => {
    const dayKey = dayKeyFromDeDatum(datum);
    if (!dayKey) return null;
    const route = `${(von ?? ort ?? '').trim().toLowerCase()}→${(nach ?? '').trim().toLowerCase()}`;
    const typ = (schrittTyp ?? 'ueberfuehrung').trim().toLowerCase();
    return `ueb:${dayKey}|${typ}|${route}`;
  };

  const add = (
    art: CalendarTerminArt,
    label: string,
    rawDatum?: string,
    rawZeit?: string,
    ort?: string,
    route?: string,
    dedupeKey?: string
  ) => {
    const datum = extractDeDatum(rawDatum);
    if (!datum) return;
    const zeit = extractZeitDe(rawDatum, rawZeit);
    const dayKey = dayKeyFromDeDatum(datum);
    if (!dayKey) return;
    const key =
      dedupeKey ??
      `${art}:${dayKey}:${zeit ?? ''}:${route ?? ''}:${ort ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    pushAtomic(atoms, s, art, label, rawDatum, rawZeit, ort, route);
  };
  const ortTf = s.trauerfeierort?.trim() || s.endziel?.trim() || undefined;
  const ortBeisetzung = s.endziel?.trim() || undefined;

  if (s.aufnahmedatum?.trim()) {
    add('aufnahme', 'Aufnahme', s.aufnahmedatum, s.aufnahmezeit, s.aufnahmeort);
  }

  if (s.rosenkranzdatum?.trim()) {
    add('rosenkranz', 'Rosenkranz', s.rosenkranzdatum, s.rosenkranzzeit, s.rosenkranzort);
  }

  if (s.trauerfeierdatum?.trim()) {
    const alsVerabschiedung = trauerfeier1AlsVerabschiedung(s);
    const label = alsVerabschiedung ? 'Verabschiedung' : 'Trauerfeier';
    const art: CalendarTerminArt = alsVerabschiedung ? 'verabschiedung' : 'trauerfeier';
    add(art, label, s.trauerfeierdatum, s.trauerfeierzeit, ortTf);
  }

  if (s.trauerfeier2datum?.trim()) {
    add('trauerfeier2', 'Trauerfeier 2', s.trauerfeier2datum, s.trauerfeier2zeit, s.trauerfeier2ort ?? ortTf);
  }

  const beisetzungsDatumNorm =
    extractDeDatum(s.beisetzungsdatum) ?? extractDeDatum(s.trauerfeierdatum) ?? undefined;

  if (beisetzungsDatumNorm) {
    if (beisetzungImAnschlussAmTrauerfeierTag(s)) {
      add('beisetzung', 'Beisetzung', beisetzungsDatumNorm, undefined, ortBeisetzung);
    } else {
      add('beisetzung', 'Beisetzung', s.beisetzungsdatum, s.beisetzungszeit, ortBeisetzung);
    }
  } else if (beisetzungImAnschlussAmTrauerfeierTag(s)) {
    add(
      'beisetzung',
      'Beisetzung',
      extractDeDatum(s.trauerfeierdatum) ?? s.trauerfeierdatum,
      undefined,
      ortBeisetzung
    );
  }

  for (const a of s.ausstehend ?? []) {
    const datum = a.terminAm ?? a.abholungAm;
    if (!datum?.trim()) continue;
    const von = a.vonOrt ?? '—';
    const nach = a.nachOrt ?? '—';
    const key = ueberfuehrungKey(datum, a.schrittTyp, von, nach);
    add(
      'ueberfuehrung',
      schrittTypLabel(a.schrittTyp),
      datum,
      undefined,
      undefined,
      `${von} → ${nach}`,
      key ?? undefined
    );
  }

  for (const v of s.verlauf ?? []) {
    const datum = v.terminAm ?? v.abholungAm;
    if (!datum?.trim()) continue;
    const von = v.vonOrt ?? v.ort ?? '—';
    const nach = v.nachOrt ?? '—';
    const key = ueberfuehrungKey(datum, v.typ, von, nach, v.ort);
    if (!key || seen.has(key)) continue;
    add(
      calendarArtFromSchritt(v.typ),
      schrittTypLabel(v.typ),
      datum,
      undefined,
      v.ort,
      `${von} → ${nach}`,
      key
    );
  }

  void name;
  return atoms;
}

function buildSearchText(s: Sterbefall, parts: AtomicTermin[]): string {
  const chunks = [
    fallName(s),
    s.sterbefallId,
    s.abholort,
    s.bestattungsart,
    s.endziel,
    s.trauerfeierort,
    s.aufnahmeort,
    s.kuehlraumId,
    s.kuehlplatz,
    ...parts.map((p) => [p.label, p.ort, p.route, p.zeit, p.dayKey].filter(Boolean).join(' ')),
  ];
  return chunks
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const TRAUERBLOCK_ART_ORDER: CalendarTerminArt[] = [
  'trauerfeier',
  'verabschiedung',
  'rosenkranz',
  'beisetzung',
];

function sortPartsChronologically(parts: AtomicTermin[]): AtomicTermin[] {
  return [...parts].sort((a, b) => a.sortMs - b.sortMs);
}

/** Zeitfenster ab Rosenkranz (falls vorhanden) bis letztem Teiltermin. */
function timeLabelFromParts(parts: AtomicTermin[]): string {
  const sorted = sortPartsChronologically(parts);
  const times = sorted.map((p) => p.zeit).filter((t): t is string => Boolean(t));
  if (times.length === 0) return '—';
  const uniq = [...new Set(times)];
  if (uniq.length === 1) return uniq[0]!;
  return `${uniq[0]}–${uniq[uniq.length - 1]}`;
}

function orderedBadgesFromParts(parts: AtomicTermin[]): string[] {
  const badges: string[] = [];
  for (const art of TRAUERBLOCK_ART_ORDER) {
    const p = parts.find((x) => x.art === art);
    if (p) badges.push(p.label);
  }
  return badges;
}

function subtitleFromGroupedParts(parts: AtomicTermin[]): string {
  const sorted = sortPartsChronologically(parts);
  const orte = sorted
    .map((p) => p.ort || p.route)
    .filter((o): o is string => Boolean(o));
  if (orte.length) return [...new Set(orte)].join(' · ');
  return '';
}

function withBestattungsMarker(s: Sterbefall, entry: WallCalendarEntry): WallCalendarEntry {
  const bestattungsMarker = calendarBestattungsMarker(s, entry.arts, entry.title);
  return bestattungsMarker ? { ...entry, bestattungsMarker } : entry;
}

function buildFeierBlockEntry(
  s: Sterbefall,
  groupParts: AtomicTermin[],
  dayKey: string,
  blockTitle: string,
  primaryArt: CalendarTerminArt
): WallCalendarEntry {
  const sorted = sortPartsChronologically(groupParts);
  const badges = orderedBadgesFromParts(sorted);
  const arts = [
    primaryArt,
    ...sorted.map((p) => p.art).filter((a, i, arr) => arr.indexOf(a) === i && a !== primaryArt),
  ];

  return withBestattungsMarker(s, {
    id: `${s.id}:block:${primaryArt}:${dayKey}`,
    docId: s.id,
    sterbefallId: s.sterbefallId ?? s.id,
    dayKey,
    dayLabel: formatDayLabelDe(dayKey),
    timeLabel: timeLabelFromParts(sorted),
    sortMs: Math.min(...sorted.map((p) => p.sortMs)),
    name: fallName(s),
    title: blockTitle,
    subtitle: subtitleFromGroupedParts(sorted),
    badges,
    grouped: true,
    arts,
    searchText: buildSearchText(s, sorted),
  });
}

/**
 * Trauerfeier: Rosenkranz + Feier + Beisetzung nur bei Im Anschluss am Trauerfeier-Tag.
 * Verabschiedung: Rosenkranz + Verabschiedung am selben Tag, Beisetzung separat.
 */
function collectTrauerblockEntries(
  s: Sterbefall,
  atoms: AtomicTermin[],
  used: Set<string>
): WallCalendarEntry[] {
  const tfDay = dayKeyFromDeDatum(s.trauerfeierdatum);
  const imAnschlussBlock = beisetzungImAnschlussAmTrauerfeierTag(s);
  const byDay = new Map<string, AtomicTermin[]>();

  for (const a of atoms) {
    if (used.has(a.key)) continue;
    if (
      a.art !== 'rosenkranz' &&
      a.art !== 'verabschiedung' &&
      a.art !== 'trauerfeier' &&
      a.art !== 'beisetzung'
    ) {
      continue;
    }
    const list = byDay.get(a.dayKey) ?? [];
    list.push(a);
    byDay.set(a.dayKey, list);
  }

  const entries: WallCalendarEntry[] = [];

  for (const [dayKey, dayAtoms] of byDay) {
    const rosen = dayAtoms.find((a) => a.art === 'rosenkranz' && !used.has(a.key));
    const ceremony = dayAtoms.find(
      (a) =>
        (a.art === 'trauerfeier' || a.art === 'verabschiedung') && !used.has(a.key)
    );
    const beisetzung = dayAtoms.find((a) => a.art === 'beisetzung' && !used.has(a.key));

    if (!ceremony) continue;

    if (imAnschlussBlock && tfDay === dayKey) {
      const groupParts: AtomicTermin[] = [];
      if (rosen) groupParts.push(rosen);
      groupParts.push(ceremony);
      if (beisetzung && beisetzung.dayKey === dayKey) groupParts.push(beisetzung);

      for (const p of groupParts) used.add(p.key);
      entries.push(
        buildFeierBlockEntry(s, groupParts, dayKey, 'Trauerfeier', 'trauerfeier')
      );
      continue;
    }

    if (rosen && ceremony.art === 'verabschiedung') {
      const groupParts = [rosen, ceremony];
      for (const p of groupParts) used.add(p.key);
      entries.push(
        buildFeierBlockEntry(s, groupParts, dayKey, 'Verabschiedung', 'verabschiedung')
      );
    }
  }

  return entries;
}

function atomicToEntry(s: Sterbefall, a: AtomicTermin): WallCalendarEntry {
  const name = fallName(s);
  const subtitle = a.route || a.ort || '';
  if (a.art === 'aufnahme') {
    return {
      id: a.key,
      docId: s.id,
      sterbefallId: s.sterbefallId ?? s.id,
      dayKey: a.dayKey,
      dayLabel: formatDayLabelDe(a.dayKey),
      timeLabel: a.zeit || '—',
      sortMs: a.sortMs,
      name: `Aufnahme - ${name}`,
      title: 'Aufnahme',
      subtitle,
      badges: ['Aufnahme'],
      grouped: false,
      arts: ['aufnahme'],
      searchText: buildSearchText(s, [a]),
    };
  }
  return withBestattungsMarker(s, {
    id: a.key,
    docId: s.id,
    sterbefallId: s.sterbefallId ?? s.id,
    dayKey: a.dayKey,
    dayLabel: formatDayLabelDe(a.dayKey),
    timeLabel: a.zeit || '—',
    sortMs: a.sortMs,
    name,
    title: a.label,
    subtitle,
    badges: [a.label],
    grouped: false,
    arts: [a.art],
    searchText: buildSearchText(s, [a]),
  });
}

function isUeberfuehrungCalendarArt(art: CalendarTerminArt): boolean {
  return art === 'ueberfuehrung' || art === 'ueberfuehrung_kremation';
}

export function isUeberfuehrungCalendarEntry(entry: WallCalendarEntry): boolean {
  return entry.arts.some((a) => isUeberfuehrungCalendarArt(a));
}

export function summarizeWallCalendarDay(entries: readonly WallCalendarEntry[]): {
  total: number;
  ueberfuehrungen: number;
} {
  let ueberfuehrungen = 0;
  for (const e of entries) {
    if (isUeberfuehrungCalendarEntry(e)) ueberfuehrungen++;
  }
  return { total: entries.length, ueberfuehrungen };
}

/** Kalendereintrag ist kein reiner Überführungstermin (für Tab „Heute“ neben flattenOffene). */
export function isFeierCalendarEntry(entry: WallCalendarEntry): boolean {
  return entry.arts.some((a) => !isUeberfuehrungCalendarArt(a));
}

/** Feier- und Beisetzungstermine an einem Kalendertag (z. B. Tab „Heute“). */
export function buildWallCalendarEntriesForDay(
  sterbefaelle: Sterbefall[],
  dayKey: string
): WallCalendarEntry[] {
  return buildWallCalendarEntries(sterbefaelle).filter((e) => e.dayKey === dayKey);
}

/** Wie {@link buildWallCalendarEntriesForDay}, ohne Überführungen (die kommen aus flattenOffene). */
export function buildWallFeierEntriesForDay(
  sterbefaelle: Sterbefall[],
  dayKey: string
): WallCalendarEntry[] {
  return buildWallCalendarEntriesForDay(sterbefaelle, dayKey).filter(isFeierCalendarEntry);
}

export function buildWallCalendarEntries(sterbefaelle: Sterbefall[]): WallCalendarEntry[] {
  const entries: WallCalendarEntry[] = [];

  for (const s of filterSterbefaelleFuerKalender(sterbefaelle)) {

    const atoms = collectAtomics(s);
    const used = new Set<string>();

    entries.push(...collectTrauerblockEntries(s, atoms, used));

    for (const a of atoms) {
      if (used.has(a.key)) continue;
      entries.push(atomicToEntry(s, a));
    }
  }

  return entries.sort((a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de'));
}

function monthStartKey(anchor: Date): string {
  return dayKeyFromDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
}

function monthEndKey(anchor: Date): string {
  return dayKeyFromDate(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
}

function dateFromDayKey(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function monthRangeFromKey(anchor: Date): string {
  return monthStartKey(anchor);
}

function monthRangeToKey(anchor: Date): string {
  return monthEndKey(anchor);
}

export function filterEntriesForAnchorMonth(
  entries: WallCalendarEntry[],
  anchor: Date
): WallCalendarEntry[] {
  const fromKey = monthStartKey(anchor);
  const toKey = monthEndKey(anchor);
  return entries.filter((e) => e.dayKey >= fromKey && e.dayKey <= toKey);
}

export function filterEntriesInDayRange(
  entries: WallCalendarEntry[],
  fromKey: string,
  toKey: string
): WallCalendarEntry[] {
  return entries.filter((e) => e.dayKey >= fromKey && e.dayKey <= toKey);
}

export function buildWallCalendarDaysInRange(
  entries: WallCalendarEntry[],
  anchor: Date,
  fromKey: string,
  toKey: string
): WallCalendarDay[] {
  const todayKey = dayKeyFromDate(anchor);
  const entriesByDay = new Map<string, WallCalendarEntry[]>();

  for (const entry of entries) {
    if (entry.dayKey < fromKey || entry.dayKey > toKey) continue;
    const list = entriesByDay.get(entry.dayKey);
    if (list) list.push(entry);
    else entriesByDay.set(entry.dayKey, [entry]);
  }

  for (const list of entriesByDay.values()) {
    list.sort((a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de'));
  }

  const days: WallCalendarDay[] = [];
  let cursor = dateFromDayKey(fromKey);
  const end = dateFromDayKey(toKey);
  while (cursor.getTime() <= end.getTime()) {
    const dayKey = dayKeyFromDate(cursor);
    const dayEntries = entriesByDay.get(dayKey) ?? [];
    days.push({
      dayKey,
      dayLabel: formatDayLabelDe(dayKey),
      weekdayShort: cursor.toLocaleDateString('de-AT', { weekday: 'short' }),
      isToday: dayKey === todayKey,
      isWeekend: cursor.getDay() === 0 || cursor.getDay() === 6,
      entries: dayEntries,
    });
    cursor = addDays(cursor, 1);
  }

  return days;
}

export function buildWallCalendarDaysForAnchorMonth(
  entries: WallCalendarEntry[],
  anchor: Date
): WallCalendarDay[] {
  return buildWallCalendarDaysInRange(
    entries,
    anchor,
    monthStartKey(anchor),
    monthEndKey(anchor)
  );
}

export function isWallCalendarDayInAnchorMonth(dayKey: string, anchor: Date): boolean {
  const [y, m] = dayKey.split('-').map(Number);
  return y === anchor.getFullYear() && m - 1 === anchor.getMonth();
}

export const MONTH_OVERVIEW_WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

export type MonthOverviewCell = WallCalendarDay | null;

export interface MonthOverviewGrid {
  weekdayLabels: readonly string[];
  cells: MonthOverviewCell[];
}

function wallCalendarDayForDate(d: Date, todayKey: string, entries: WallCalendarDay['entries'] = []): WallCalendarDay {
  const dayKey = dayKeyFromDate(d);
  return {
    dayKey,
    dayLabel: formatDayLabelDe(dayKey),
    weekdayShort: d.toLocaleDateString('de-AT', { weekday: 'short' }),
    isToday: dayKey === todayKey,
    isWeekend: d.getDay() === 0 || d.getDay() === 6,
    entries,
  };
}

/** Monatsübersicht Mo–So mit leeren Zellen vor/nach dem Monat. */
export function buildMonthOverviewGrid(
  monthDays: WallCalendarDay[],
  anchor: Date,
  todayKey: string
): MonthOverviewGrid {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const byKey = new Map(monthDays.map((d) => [d.dayKey, d]));
  const cells: MonthOverviewCell[] = [];

  for (let i = 0; i < total; i++) {
    const dom = i - offset + 1;
    if (dom < 1 || dom > daysInMonth) {
      cells.push(null);
      continue;
    }
    const dayKey = dayKeyFromDate(new Date(y, m, dom));
    cells.push(byKey.get(dayKey) ?? wallCalendarDayForDate(new Date(y, m, dom), todayKey));
  }

  return { weekdayLabels: MONTH_OVERVIEW_WEEKDAY_LABELS, cells };
}

function weekSpanFromAnchor(anchor: Date, weeks: 1 | 2): { fromKey: string; toKey: string; count: number } {
  const monday = startOfWeekMonday(anchor);
  const count = weeks * 7;
  return {
    fromKey: dayKeyFromDate(monday),
    toKey: dayKeyFromDate(addDays(monday, count - 1)),
    count,
  };
}

export function filterCalendarEntries(
  entries: WallCalendarEntry[],
  range: WallCalendarRange,
  anchor: Date,
  query: string
): WallCalendarEntry[] {
  const q = query.trim().toLowerCase();
  let fromKey: string;
  let toKey: string;

  if (range === 'month') {
    fromKey = monthRangeFromKey(anchor);
    toKey = monthRangeToKey(anchor);
  } else {
    const weeks = range === 14 ? 2 : 1;
    ({ fromKey, toKey } = weekSpanFromAnchor(anchor, weeks));
  }

  return entries.filter((e) => {
    if (e.dayKey < fromKey || e.dayKey > toKey) return false;
    if (q && !e.searchText.includes(q)) return false;
    return true;
  });
}

export function buildWallCalendarDays(
  entries: WallCalendarEntry[],
  range: WallCalendarRange,
  anchor: Date
): WallCalendarDay[] {
  const todayKey = dayKeyFromDate(anchor);
  const days: WallCalendarDay[] = [];
  const entriesByDay = new Map<string, WallCalendarEntry[]>();

  for (const entry of entries) {
    const list = entriesByDay.get(entry.dayKey);
    if (list) {
      list.push(entry);
    } else {
      entriesByDay.set(entry.dayKey, [entry]);
    }
  }

  for (const list of entriesByDay.values()) {
    list.sort((a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de'));
  }

  let cursor: Date;
  let count: number;

  if (range === 'month') {
    const fromKey = monthRangeFromKey(anchor);
    const toKey = monthRangeToKey(anchor);
    return buildWallCalendarDaysInRange(entries, anchor, fromKey, toKey);
  }

  const weeks = range === 14 ? 2 : 1;
  cursor = startOfWeekMonday(anchor);
  count = weeks * 7;

  for (let i = 0; i < count; i++) {
    const d = addDays(cursor, i);
    const dayKey = dayKeyFromDate(d);
    const dayEntries = entriesByDay.get(dayKey) ?? [];

    days.push({
      dayKey,
      dayLabel: formatDayLabelDe(dayKey),
      weekdayShort: d.toLocaleDateString('de-AT', { weekday: 'short' }),
      isToday: dayKey === todayKey,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      entries: dayEntries,
    });
  }

  return days;
}

export function countCalendarEntries(entries: WallCalendarEntry[]): number {
  return entries.length;
}
