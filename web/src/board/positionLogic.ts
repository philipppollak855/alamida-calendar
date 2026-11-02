import type { Sterbefall, VerlaufEintrag } from '../types';
import { parseDatumDe } from './dateUtils';
import { istKrematorium } from './ortKeywords';

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Letzte Verlauf-Etappe mit Datum heute oder früher (höchste Zeilennummer). */
export function letzteAbgeschlosseneEtappe(s: Sterbefall): VerlaufEintrag | null {
  const heute = startOfTodayMs();
  let best: VerlaufEintrag | null = null;
  let bestKey = -1;

  for (const v of s.verlauf ?? []) {
    const termin = v.terminAm ?? v.abholungAm;
    if (!termin?.trim()) continue;
    const ms = parseDatumDe(termin);
    if (ms > heute) continue;
    const key = (v.nummer ?? 0) * 1e15 + ms;
    if (key >= bestKey) {
      bestKey = key;
      best = v;
    }
  }

  return best;
}

export function istAktuellImKrematorium(s: Sterbefall): boolean {
  if (s.aktuellePositionTyp === 'kremation') return true;

  const pos = s.aktuellePosition?.trim();
  if (pos && istKrematorium(pos)) return true;

  const letzte = letzteAbgeschlosseneEtappe(s);
  if (!letzte) return false;

  if (letzte.typ === 'kremation') return true;
  const ort = letzte.nachOrt ?? letzte.ort;
  return !!ort && istKrematorium(ort);
}
