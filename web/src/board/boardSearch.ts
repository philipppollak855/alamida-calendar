import { fallAbschlussGrundLabel } from './fallAbschluss';
import type { OffeneUeberfuehrungRow, Sterbefall } from '../types';

export function normalizeBoardSearch(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

function haystackParts(parts: (string | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function matchSterbefallQuery(s: Sterbefall, rawQuery: string): boolean {
  const q = normalizeBoardSearch(rawQuery);
  if (!q) return true;
  const hay = haystackParts([
    s.verstorbenerName,
    s.verstorbenerVorname,
    s.verstorbenerNachname,
    s.sterbefallId,
    s.id,
    s.aktuellePosition,
    s.endziel,
    s.kuehlplatz,
    s.kuehlraumId,
    s.abholort,
    s.naechsterSchrittNach,
    s.naechsteUeberfuehrungNach,
    s.historieGrund,
    s.abschlussGrund,
    s.abschlussBemerkung,
    fallAbschlussGrundLabel(s.historieGrund ?? s.abschlussGrund),
  ]);
  return q.split(' ').every((token) => hay.includes(token));
}

export function matchTransferQuery(row: OffeneUeberfuehrungRow, rawQuery: string): boolean {
  const q = normalizeBoardSearch(rawQuery);
  if (!q) return true;
  const hay = haystackParts([
    row.name,
    row.sterbefallId,
    row.vonOrt,
    row.nachOrt,
    row.endziel,
    row.terminAm,
  ]);
  return q.split(' ').every((token) => hay.includes(token));
}
