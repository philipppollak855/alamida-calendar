import type { Sterbefall } from '../types';
import { getEffectiveAusstehend, schrittZielIstEigeneKr } from './ausstehendEffective';
import { isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import { parseDatumDe } from './dateUtils';
import { parseUeberfuehrungRoute } from './routeParse';
import { istKrankenhaus, istKrematorium } from './ortKeywords';
import { istAktuellImKrematorium, letzteAbgeschlosseneEtappe } from './positionLogic';
import { istInHistory } from './historieLogic';

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Ziel ist ein konfigurierter Firmenkühlraum (z. B. Grafenbach). */
export function zielIstEigenerKuehlraum(nachOrt?: string): boolean {
  if (!nachOrt?.trim()) return false;
  return !!matchEigenerKuehlraum(nachOrt);
}

/**
 * Überführung ins eigene KR ist vorgebucht, aber noch nicht erfolgt (kein / zukünftiges Datum).
 */
export function hatAusstehendeUeberfuehrungInsEigeneKr(s: Sterbefall): boolean {
  if (istAktuellImKrematorium(s)) return false;

  return getEffectiveAusstehend(s).some((a) => {
    if (!schrittZielIstEigeneKr(a)) return false;
    const termin = a.terminAm ?? a.abholungAm;
    if (!termin?.trim()) return true;
    return parseDatumDe(termin) > startOfTodayMs();
  });
}

function positionIstImKuehlraum(pos?: string): boolean {
  if (!pos?.trim()) return false;
  return !!matchEigenerKuehlraum(pos) || /kühlr|kuehlr/i.test(pos);
}

function letzteEtappeIstImEigenenKuehlraum(s: Sterbefall): boolean {
  const letzte = letzteAbgeschlosseneEtappe(s);
  if (!letzte) return false;

  if (letzte.typ === 'kremation') return false;

  const ort = letzte.nachOrt ?? letzte.ort;
  if (ort && istKrematorium(ort)) return false;

  return (
    zielIstEigenerKuehlraum(letzte.nachOrt) ||
    positionIstImKuehlraum(ort) ||
    !!matchEigenerKuehlraum(ort)
  );
}

type KrSchrittRef = {
  vonOrt?: string;
  nachOrt?: string;
  terminAm?: string;
  zeile: number;
};

function nachOrtAusSchritt(vonOrt?: string, nachOrt?: string): string | undefined {
  const nach = nachOrt?.trim();
  if (nach) return nach;
  return parseUeberfuehrungRoute(vonOrt ?? '').nach?.trim() || undefined;
}

/** Abgeschlossene KR-Überführung aus Terminen (auch wenn Verlauf/Position noch am KH hängen). */
function collectAbgeschlosseneKrSchritte(s: Sterbefall): KrSchrittRef[] {
  const heute = startOfTodayMs();
  const out: KrSchrittRef[] = [];
  const seen = new Set<string>();

  const add = (ref: KrSchrittRef) => {
    const nach = nachOrtAusSchritt(ref.vonOrt, ref.nachOrt);
    if (!schrittZielIstEigeneKr({ vonOrt: ref.vonOrt, nachOrt: nach })) return;
    const termin = ref.terminAm?.trim();
    if (!termin) return;
    if (parseDatumDe(termin) > heute) return;
    const key = `${ref.zeile}:${termin}:${ref.vonOrt ?? ''}:${nach ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...ref, nachOrt: nach });
  };

  for (const a of getEffectiveAusstehend(s)) {
    add({
      vonOrt: a.vonOrt,
      nachOrt: a.nachOrt,
      terminAm: a.terminAm ?? a.abholungAm,
      zeile: a.zeile ?? 0,
    });
  }

  const topLevel: [string | undefined, string | undefined, string | undefined, number][] = [
    [s.naechsterSchrittVon, s.naechsterSchrittNach, s.naechsterSchrittAm, 9001],
    [s.naechsteUeberfuehrungVon, s.naechsteUeberfuehrungNach, s.naechsteUeberfuehrungAm, 9002],
  ];
  for (const [von, nach, termin, zeile] of topLevel) {
    if (!von?.trim() && !nach?.trim()) continue;
    add({ vonOrt: von, nachOrt: nach, terminAm: termin, zeile });
  }

  const abhol = s.abholort?.trim();
  if (abhol) {
    const route = parseUeberfuehrungRoute(abhol);
    add({
      vonOrt: route.von || abhol,
      nachOrt: route.nach ?? s.naechsterSchrittNach ?? s.naechsteUeberfuehrungNach,
      terminAm: s.naechsterSchrittAm ?? s.naechsteUeberfuehrungAm,
      zeile: 9000,
    });
  }

  return out;
}

function letzteAbgeschlosseneKrUeberfuehrung(s: Sterbefall): KrSchrittRef | null {
  const list = collectAbgeschlosseneKrSchritte(s);
  if (list.length === 0) return null;
  return list.reduce((best, cur) => {
    const bestMs = parseDatumDe(best.terminAm ?? '');
    const curMs = parseDatumDe(cur.terminAm ?? '');
    if (curMs > bestMs) return cur;
    if (curMs < bestMs) return best;
    return (cur.zeile ?? 0) >= (best.zeile ?? 0) ? cur : best;
  });
}

function abgeschlosseneKrUeberfuehrungIstImEigenenKuehlraum(s: Sterbefall): boolean {
  const letzte = letzteAbgeschlosseneKrUeberfuehrung(s);
  if (!letzte) return false;
  const nach = letzte.nachOrt ?? nachOrtAusSchritt(letzte.vonOrt, letzte.nachOrt);
  return zielIstEigenerKuehlraum(nach) || positionIstImKuehlraum(nach);
}

/** Kühlraum-Ort für Slot-Zuordnung, wenn Position in Alamida noch nicht aktualisiert ist. */
export function resolveKuehlraumOrtWennImKr(s: Sterbefall): string | undefined {
  const fromId = s.kuehlraumId?.trim();
  if (fromId && matchEigenerKuehlraum(fromId)) return fromId;

  const pos = s.aktuellePosition?.trim();
  if (pos && matchEigenerKuehlraum(pos)) return pos;

  const letzteKr = letzteAbgeschlosseneKrUeberfuehrung(s);
  if (letzteKr) {
    const nach = letzteKr.nachOrt ?? nachOrtAusSchritt(letzteKr.vonOrt, letzteKr.nachOrt);
    if (nach?.trim()) return nach.trim();
  }

  const etappe = letzteAbgeschlosseneEtappe(s);
  if (etappe) {
    const ort = (etappe.nachOrt ?? etappe.ort)?.trim();
    if (ort && matchEigenerKuehlraum(ort)) return ort;
  }

  return undefined;
}

/**
 * Überführung ins eigene Kühlraum abgeschlossen und Verstorbener noch nicht weiter (Kremation/Beisetzung).
 */
export function hatAbgeschlosseneUeberfuehrungInsEigeneKr(s: Sterbefall): boolean {
  if (istInHistory(s) || istAktuellImKrematorium(s)) return false;

  if (letzteEtappeIstImEigenenKuehlraum(s)) return true;

  if (abgeschlosseneKrUeberfuehrungIstImEigenenKuehlraum(s)) return true;

  const pos = s.aktuellePosition?.trim() ?? '';
  if (pos && (positionIstImKuehlraum(pos) || matchEigenerKuehlraum(pos))) return true;

  if (
    s.status === 'im_kuehlraum' &&
    s.kuehlplatz?.trim() &&
    matchEigenerKuehlraum(s.kuehlraumId) &&
    s.aktuellePositionTyp !== 'sterbeort' &&
    s.aktuellePositionTyp !== 'kremation'
  ) {
    return true;
  }

  if (s.kuehlplatz?.trim() && matchEigenerKuehlraum(s.kuehlraumId)) {
    if (s.aktuellePositionTyp === 'sterbeort' || s.aktuellePositionTyp === 'kremation') return false;
    if (pos && istKrankenhaus(pos)) return false;
    if (!letzteAbgeschlosseneEtappe(s)) return true;
  }

  return false;
}

/** Aktuell am Sterbeort oder KH — nicht nach erfolgter Weiterführung (KR/Kremation). */
export function isAmKrankenhausOderSterbeort(s: Sterbefall): boolean {
  if (istInHistory(s) || hatAbgeschlosseneUeberfuehrungInsEigeneKr(s) || istAktuellImKrematorium(s)) {
    return false;
  }

  const pos = s.aktuellePosition?.trim();
  if (pos) {
    if (positionIstImKuehlraum(pos) || matchEigenerKuehlraum(pos)) return false;
    if (istKrankenhaus(pos)) return true;
    return false;
  }

  if (s.aktuellePositionTyp === 'sterbeort') return true;

  if (hatAusstehendeUeberfuehrungInsEigeneKr(s)) return true;

  const hatOffeneKhAbholung = getEffectiveAusstehend(s).some(
    (a) =>
      a.istAbholungVomSterbeort ||
      a.status === 'abholung_noetig' ||
      (a.schrittTyp === 'abholung' &&
        isAusstehendHeuteOrGeplant(a) &&
        a.vonOrt &&
        istKrankenhaus(a.vonOrt))
  );
  if (hatOffeneKhAbholung) return true;

  if (
    s.kuehlplatz?.trim() &&
    matchEigenerKuehlraum(s.kuehlraumId) &&
    s.aktuellePositionTyp !== 'sterbeort'
  ) {
    return false;
  }

  if (
    s.abholortIstKrankenhaus ||
    istKrankenhaus(s.abholort)
  ) {
    return true;
  }

  return false;
}

/** Physisch im Firmenkühlraum (z. B. Grafenbach) — nicht in Kremation oder nach Beisetzung. */
export function isImEigenenKuehlraum(s: Sterbefall): boolean {
  if (istInHistory(s) || istAktuellImKrematorium(s)) return false;

  return hatAbgeschlosseneUeberfuehrungInsEigeneKr(s);
}
