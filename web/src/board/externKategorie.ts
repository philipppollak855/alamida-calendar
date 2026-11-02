import type { DispositionSettings } from '../types/dispositionSettings';
import { getDispositionSettings } from '../settings/dispositionSettingsStore';
import {
  istBestattungOrt,
  istKrankenhausOrt,
  istPflegeheimOrt,
} from '../settings/recognitionEngine';
import { istKrematorium } from '../settings/ortMatchers';

/** Kategorie für Extern-Wandkarten (Badge). */
export type ExternKartenKategorie =
  | 'krankenhaus'
  | 'pflegeheim'
  | 'bestattung'
  | 'kremation'
  | 'kuehlraum'
  | 'extern';

export function classifyExternKartenKategorie(
  ort: string,
  settings?: DispositionSettings
): ExternKartenKategorie {
  const cfg = settings ?? getDispositionSettings();
  const t = ort.trim();
  if (!t) return 'extern';
  if (istKrematorium(t)) return 'kremation';
  if (istKrankenhausOrt(t, cfg)) return 'krankenhaus';
  if (istPflegeheimOrt(t, cfg)) return 'pflegeheim';
  if (istBestattungOrt(t, cfg)) return 'bestattung';
  return 'extern';
}

export function externKategorieBadgeLabel(typ: ExternKartenKategorie): string {
  switch (typ) {
    case 'krankenhaus':
      return 'Krankenhaus';
    case 'pflegeheim':
      return 'Pflegeheim';
    case 'bestattung':
      return 'Bestattung';
    case 'kremation':
      return 'Kremation';
    case 'kuehlraum':
      return 'Kühlraum';
    default:
      return 'Extern';
  }
}

export function externKategorieGruppenKey(typ: ExternKartenKategorie, ort: string): string {
  const basis = ort.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${typ}:${basis}`;
}

/** Freigabe-Button auf Extern-Karten (KH, Pflegeheim, Bestattung). */
export function externKategorieHatFreigabe(typ: ExternKartenKategorie): boolean {
  return typ === 'krankenhaus' || typ === 'pflegeheim' || typ === 'bestattung' || typ === 'kuehlraum';
}
