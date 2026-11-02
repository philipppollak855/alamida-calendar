import type { AusstehendEintrag, Sterbefall } from '../types';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import { parseUeberfuehrungRoute } from './routeParse';

/** Ziel ist Firmen-KR — auch wenn „nach“ nur in vonOrt-Routentext steht. */
export function schrittZielIstEigeneKr(a: {
  vonOrt?: string;
  nachOrt?: string;
}): boolean {
  if (matchEigenerKuehlraum(a.nachOrt)) return true;
  const route = parseUeberfuehrungRoute(a.vonOrt ?? '');
  return !!matchEigenerKuehlraum(route.nach ?? undefined);
}

function syntheticAbholung(
  vonRaw: string,
  nachRaw: string | undefined,
  opts: { zeile?: number; schrittTyp?: string; terminAm?: string; status?: string }
): AusstehendEintrag {
  const route = parseUeberfuehrungRoute(vonRaw);
  const von = (route.von || vonRaw).trim();
  const nach = nachRaw?.trim() || route.nach?.trim() || '';
  return {
    zeile: opts.zeile ?? 1,
    schrittTyp: opts.schrittTyp ?? 'abholung',
    vonOrt: von,
    nachOrt: nach,
    terminAm: opts.terminAm,
    status: opts.status ?? 'geplant',
  };
}

/**
 * Firestore-ausstehend oder Fallback aus naechsterSchritt / Abholort-Routentext
 * (wenn Agent nur Top-Level-Felder geschrieben hat oder Heartbeat ohne ausstehend[]).
 */
export function getEffectiveAusstehend(s: Sterbefall): AusstehendEintrag[] {
  const raw = s.ausstehend ?? [];
  if (raw.length > 0) return raw;

  const candidates: {
    von?: string;
    nach?: string;
    typ?: string;
    terminAm?: string;
  }[] = [
    {
      von: s.naechsterSchrittVon,
      nach: s.naechsterSchrittNach,
      typ: s.naechsterSchrittTyp,
      terminAm: s.naechsterSchrittAm,
    },
    {
      von: s.naechsteUeberfuehrungVon,
      nach: s.naechsteUeberfuehrungNach,
      terminAm: s.naechsteUeberfuehrungAm,
    },
  ];

  const abholort = s.abholort?.trim();
  if (abholort) {
    const route = parseUeberfuehrungRoute(abholort);
    const nachFromTop =
      s.naechsterSchrittNach?.trim() ||
      s.naechsteUeberfuehrungNach?.trim() ||
      route.nach?.trim();
    if (nachFromTop && matchEigenerKuehlraum(nachFromTop)) {
      candidates.push({
        von: (route.von || abholort).trim(),
        nach: nachFromTop,
        typ: s.naechsterSchrittTyp ?? 'abholung',
        terminAm: s.naechsterSchrittAm ?? s.naechsteUeberfuehrungAm,
      });
    } else if (route.nach && matchEigenerKuehlraum(route.nach)) {
      candidates.push({
        von: (route.von || abholort).trim(),
        nach: route.nach.trim(),
        typ: 'abholung',
      });
    } else {
      candidates.push({ von: abholort, typ: 'abholung' });
    }
  }

  for (const c of candidates) {
    const vonTrim = c.von?.trim();
    if (!vonTrim) continue;
    const route = parseUeberfuehrungRoute(vonTrim);
    const nach = c.nach?.trim() || route.nach?.trim();
    if (!nach || !matchEigenerKuehlraum(nach)) continue;
    return [
      syntheticAbholung(vonTrim, nach, {
        schrittTyp: c.typ ?? 'abholung',
        terminAm: c.terminAm,
      }),
    ];
  }

  return raw;
}

/** Erste Abholungszeile aus ausstehend oder naechsterSchritt. */
export function getAbholungSchrittRef(s: Sterbefall): AusstehendEintrag | undefined {
  const aus = getEffectiveAusstehend(s);
  const fromAus = aus.find((a) => a.schrittTyp === 'abholung' || a.zeile === 1);
  if (fromAus?.vonOrt?.trim()) return fromAus;

  const von = s.naechsterSchrittVon?.trim();
  if (von && (s.naechsterSchrittTyp === 'abholung' || s.naechsterSchrittTyp === 'ueberfuehrung')) {
    return syntheticAbholung(von, s.naechsterSchrittNach, {
      schrittTyp: s.naechsterSchrittTyp,
      terminAm: s.naechsterSchrittAm,
    });
  }

  if (s.abholort?.trim()) {
    return syntheticAbholung(s.abholort, undefined, { schrittTyp: 'abholung' });
  }

  return undefined;
}
