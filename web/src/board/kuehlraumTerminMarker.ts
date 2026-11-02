import type { Sterbefall } from '../types';
import { isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import { extractDeDatum, parseDatumDeToDate } from './dateUtils';
import {
  beisetzungAlsEigenerTermin,
  type BestattungsMarker,
  findeKremationTermin,
  hatKremationImSterbefall,
  kuehlraumBestattungsMarker,
  trauerfeier1AlsVerabschiedung,
} from './feierterminLogic';

export type KuehlraumTerminMarkerKind =
  | 'kremation'
  | 'beisetzung'
  | 'trauerfeier'
  | 'verabschiedung';

export interface KuehlraumTerminMarker {
  kind: KuehlraumTerminMarkerKind;
  datum: string;
  relativeLabel: string;
  /** Anzeigezeile, z. B. „Kremation in 2 Tagen · 24.05.2026“ */
  label: string;
  bestattungsMarker?: BestattungsMarker;
}

const MARKER_PREFIX: Record<KuehlraumTerminMarkerKind, string> = {
  kremation: 'Kremation',
  beisetzung: 'Beisetzung',
  trauerfeier: 'Trauerfeier',
  verabschiedung: 'Verabschiedung',
};

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

function hatKremationImAblauf(s: Sterbefall): boolean {
  return hatKremationImSterbefall(s);
}

function feierMarkerKindTf1(s: Sterbefall): KuehlraumTerminMarkerKind {
  return trauerfeier1AlsVerabschiedung(s) ? 'verabschiedung' : 'trauerfeier';
}

function feierMarkerKindTf2(s: Sterbefall): KuehlraumTerminMarkerKind {
  if (!beisetzungAlsEigenerTermin(s)) return 'trauerfeier';
  return 'verabschiedung';
}

export function relativeTerminLabel(datum: string, now: Date): string {
  const target = parseDatumDeToDate(datum);
  if (!target) return '';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) {
    if (diffDays === -1) return 'gestern';
    return `vor ${-diffDays} Tagen`;
  }
  if (diffDays === 0) return 'heute';
  if (diffDays === 1) return 'morgen';
  return `in ${diffDays} Tagen`;
}

function formatMarkerLabel(
  kind: KuehlraumTerminMarkerKind,
  datum: string | undefined,
  now: Date,
  offenLabel?: string
): KuehlraumTerminMarker | null {
  const prefix = MARKER_PREFIX[kind];
  if (!datum?.trim() || !parseDatumDeToDate(datum)) {
    if (kind === 'kremation' || offenLabel) {
      return {
        kind,
        datum: '',
        relativeLabel: '',
        label: offenLabel ?? `${prefix} — Termin offen`,
      };
    }
    return null;
  }
  const d = datum.trim();
  const relativeLabel = relativeTerminLabel(d, now);
  const label = relativeLabel ? `${prefix} ${relativeLabel} · ${d}` : `${prefix} · ${d}`;
  return { kind, datum: d, relativeLabel, label };
}

function withKuehlraumBestattungsMarker(
  s: Sterbefall,
  marker: KuehlraumTerminMarker,
  now: Date
): KuehlraumTerminMarker {
  if (marker.kind === 'kremation') return marker;
  return {
    ...marker,
    bestattungsMarker: kuehlraumBestattungsMarker(s, marker.kind, now, marker.datum),
  };
}

function pushFeierMarker(
  list: KuehlraumTerminMarker[],
  s: Sterbefall,
  kind: Exclude<KuehlraumTerminMarkerKind, 'kremation'>,
  datum: string | undefined,
  now: Date
) {
  const m = formatMarkerLabel(kind, datum, now);
  if (m) list.push(withKuehlraumBestattungsMarker(s, m, now));
}

/** Relevante Termine für Kühlraum-Kacheln (Kalender-Regeln für Feier/Beisetzung). */
export function buildKuehlraumTerminMarkers(
  s: Sterbefall,
  now: Date = new Date()
): KuehlraumTerminMarker[] {
  const markers: KuehlraumTerminMarker[] = [];
  const bsEigenerTermin = beisetzungAlsEigenerTermin(s);

  const tf1 = extractDeDatum(s.trauerfeierdatum);
  if (tf1) pushFeierMarker(markers, s, feierMarkerKindTf1(s), tf1, now);

  const tf2 = extractDeDatum(s.trauerfeier2datum);
  if (tf2) pushFeierMarker(markers, s, feierMarkerKindTf2(s), tf2, now);

  if (hatKremationImAblauf(s)) {
    const kr = formatMarkerLabel('kremation', findeKremationTermin(s), now);
    if (kr) markers.push(kr);
  }

  if (bsEigenerTermin) {
    const beisetzung = extractDeDatum(s.beisetzungsdatum);
    if (beisetzung) pushFeierMarker(markers, s, 'beisetzung', beisetzung, now);
  }

  return markers;
}

/** @deprecated Einzelmarker — nutzt ersten Eintrag aus {@link buildKuehlraumTerminMarkers}. */
export function buildKuehlraumTerminMarker(
  s: Sterbefall,
  now: Date = new Date()
): KuehlraumTerminMarker | null {
  return buildKuehlraumTerminMarkers(s, now)[0] ?? null;
}
