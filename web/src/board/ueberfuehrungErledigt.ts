import type { Sterbefall } from '../types';

export function getErledigteZeilen(s: Sterbefall): number[] {
  const raw = s.erledigteUeberfuehrungenZeilen;
  if (!raw?.length) return [];
  return raw.map((z) => Number(z)).filter((n) => Number.isFinite(n) && n > 0);
}

export function isUeberfuehrungZeileErledigt(s: Sterbefall, zeile: number): boolean {
  if (zeile <= 0) return false;
  return getErledigteZeilen(s).includes(zeile);
}

export function schrittKey(sterbefallId: string, zeile: number): string {
  return `${sterbefallId}:${zeile}`;
}
