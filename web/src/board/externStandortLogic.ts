import type { Sterbefall } from '../types';
import { getEffectiveAusstehend, schrittZielIstEigeneKr } from './ausstehendEffective';
import { parseUeberfuehrungRoute } from './routeParse';
import { zielIstEigenerKuehlraum } from './kuehlraumLogic';
import { canonicalKrankenhausAnzeigeLabel } from '../settings/krankenhausOrt';
import { istKrematorium, istKrankenhaus, matchEigenerKuehlraum, ortLabel } from '../settings/ortMatchers';
import { isAusstehendHeuteOrGeplant } from './ausstehendStatus';

/** Von-Ort außerhalb Firmen-KR/Krematorium (z. B. Pflegeheim Senecura). */
export function istExternerAbholort(ort?: string): boolean {
  const t = ort?.trim();
  if (!t) return false;
  if (istKrematorium(t) || zielIstEigenerKuehlraum(t) || matchEigenerKuehlraum(t)) return false;
  if (/^kühlr|^kuehlr/i.test(t)) return false;
  return true;
}

function ausstehendeKrSchritte(s: Sterbefall) {
  return getEffectiveAusstehend(s).filter(
    (a) => schrittZielIstEigeneKr(a) && isAusstehendHeuteOrGeplant(a)
  );
}

/** Ausstehende Überführung ins eigene KR von einem externen Ort (nicht nur KH). */
export function hatAusstehendeUeberfuehrungVonExternemOrt(s: Sterbefall): boolean {
  return ausstehendeKrSchritte(s).some((a) => {
    const von = a.vonOrt?.trim();
    return !!von && istExternerAbholort(von);
  });
}

/** Anzeige-Ort für Extern-Karte (Senecura, UK, …). */
export function resolveExternAbholOrtLabel(s: Sterbefall): string | null {
  for (const a of ausstehendeKrSchritte(s)) {
    const von = a.vonOrt?.trim();
    if (!von || !istExternerAbholort(von)) continue;
    const { von: basis } = parseUeberfuehrungRoute(von);
    return ortLabel(basis || von);
  }

  const kandidaten = [
    s.abholort,
    s.aktuellePosition,
    s.naechsterSchrittVon,
    s.naechsteUeberfuehrungVon,
  ];
  for (const raw of kandidaten) {
    const t = raw?.trim();
    if (!t || !istExternerAbholort(t)) continue;
    if (!hatAusstehendeUeberfuehrungVonExternemOrt(s)) {
      const hatKrZiel =
        zielIstEigenerKuehlraum(s.naechsterSchrittNach) ||
        zielIstEigenerKuehlraum(s.naechsteUeberfuehrungNach);
      if (!hatKrZiel) continue;
    }
    const { von: basis } = parseUeberfuehrungRoute(t);
    return ortLabel(basis || t);
  }

  return null;
}

export function externOrtAnzeigeLabel(ort: string): string {
  if (istKrankenhaus(ort)) return canonicalKrankenhausAnzeigeLabel(ort);
  return ortLabel(ort);
}
