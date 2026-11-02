import type { Sterbefall } from '../types';
import type { DispositionSettings, EigenerKuehlraumConfig } from '../types/dispositionSettings';
import { getDispositionSettings } from '../settings/dispositionSettingsStore';
import { keywordMatchesText } from '../settings/recognitionEngine';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import { krankenhausOrtKey } from '../settings/krankenhausOrt';
import { getEffectiveAusstehend } from './ausstehendEffective';
import { isImEigenenKuehlraum, resolveKuehlraumOrtWennImKr } from './kuehlraumLogic';
import { parseUeberfuehrungRoute } from './routeParse';

function ortTexteFuerExternMatch(ort: string): string[] {
  const t = ort.trim();
  if (!t) return [];
  const { von } = parseUeberfuehrungRoute(t);
  const basis = (von || t).trim();
  const khKey = krankenhausOrtKey(basis);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [t, basis, khKey]) {
    const n = x.trim().toLowerCase();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(x.trim());
  }
  return out;
}

/** Externer Abholort → konfigurierter Kühlraum (externKeywords). */
export function matchExternOrtZuKuehlraum(
  ort: string,
  settings?: DispositionSettings
): EigenerKuehlraumConfig | null {
  const cfg = settings ?? getDispositionSettings();
  for (const kr of cfg.eigeneKuehlraeume) {
    const keywords = kr.externKeywords ?? [];
    if (keywords.length === 0) continue;
    for (const text of ortTexteFuerExternMatch(ort)) {
      if (keywords.some((kw) => keywordMatchesText(text, kw))) return kr;
    }
  }
  return null;
}

function nachOrtAusSchritt(vonOrt?: string, nachOrt?: string): string | undefined {
  const nach = nachOrt?.trim();
  if (nach) return nach;
  return parseUeberfuehrungRoute(vonOrt ?? '').nach?.trim() || undefined;
}

/** Ziel-Kühlraum eines Falls (physisch, geplant oder per Extern-Zuordnung). */
export function resolveFallKuehlraum(
  s: Sterbefall,
  settings?: DispositionSettings
): EigenerKuehlraumConfig | null {
  const cfg = settings ?? getDispositionSettings();
  if (cfg.eigeneKuehlraeume.length === 0) return null;

  if (isImEigenenKuehlraum(s)) {
    const ort = resolveKuehlraumOrtWennImKr(s);
    if (ort) {
      const matched = matchEigenerKuehlraum(ort, cfg);
      if (matched) return matched;
    }
  }

  for (const a of getEffectiveAusstehend(s)) {
    const von = a.vonOrt?.trim();
    const nach = nachOrtAusSchritt(a.vonOrt, a.nachOrt);
    if (von) {
      const byExtern = matchExternOrtZuKuehlraum(von, cfg);
      if (byExtern) return byExtern;
    }
    const byNach = matchEigenerKuehlraum(nach, cfg);
    if (byNach) return byNach;
  }

  const vonFelder = [
    s.naechsterSchrittVon,
    s.naechsteUeberfuehrungVon,
    s.abholort,
    s.aktuellePosition,
  ];
  for (const raw of vonFelder) {
    const t = raw?.trim();
    if (!t) continue;
    const byExtern = matchExternOrtZuKuehlraum(t, cfg);
    if (byExtern) return byExtern;
  }

  for (const nach of [s.naechsterSchrittNach, s.naechsteUeberfuehrungNach]) {
    const byNach = matchEigenerKuehlraum(nach, cfg);
    if (byNach) return byNach;
  }

  return null;
}

export function resolveFallKuehlraumId(
  s: Sterbefall,
  settings?: DispositionSettings
): string | undefined {
  return resolveFallKuehlraum(s, settings)?.id;
}

/** Fallback wenn keine Zuordnung: erster Kühlraum. */
export function resolveFallKuehlraumIdOrPrimary(
  s: Sterbefall,
  settings?: DispositionSettings
): string | undefined {
  const cfg = settings ?? getDispositionSettings();
  return resolveFallKuehlraumId(s, cfg) ?? cfg.eigeneKuehlraeume[0]?.id;
}
