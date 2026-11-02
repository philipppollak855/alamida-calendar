import type { DispositionSettings, EigenerKuehlraumConfig } from '../types/dispositionSettings';

export type OrtErkennungErgebnis = {
  ort: string;
  kremation: boolean;
  krankenhaus: boolean;
  pflegeheim: boolean;
  bestattung: boolean;
  eigenerKuehlraum: EigenerKuehlraumConfig | null;
  treffer: string[];
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalisiert ein Keyword (trim, lowercase für Vergleich). */
export function normalizeKeyword(kw: string): string {
  return kw.trim().toLowerCase();
}

/** Entfernt Duplikate, leere Einträge; behält Reihenfolge. */
export function dedupeKeywords(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const k = raw.trim();
    if (!k) continue;
    const key = normalizeKeyword(k);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/**
 * Enthält-Match mit Wortgrenzen bei kurzen Keywords (≥2 Zeichen),
 * um Fehl-Treffer zu reduzieren (z. B. „fe“ in „feuerbach“).
 */
export function keywordMatchesText(text: string, keyword: string): boolean {
  const k = normalizeKeyword(keyword);
  if (k.length < 2) return false;
  const t = text.toLowerCase();

  if (k.length >= 4 || k.includes(' ') || k.includes('-')) {
    return t.includes(k);
  }

  const boundary = new RegExp(
    `(?:^|[\\s,./(]|['"])${escapeRegex(k)}(?:$|[\\s,./)]|['"]|-)`,
    'i'
  );
  return boundary.test(text) || t.includes(k);
}

export function prefixMatchesText(text: string, prefix: string): boolean {
  const p = prefix.trim();
  if (!p) return false;
  return text.trim().toLowerCase().startsWith(p.toLowerCase());
}

function ortMatchesPrefixe(ort: string, prefixe: string[]): boolean {
  return prefixe.some((p) => prefixMatchesText(ort, p));
}

function ortMatchesKeywords(ort: string, keywords: string[]): boolean {
  return keywords.some((kw) => keywordMatchesText(ort, kw));
}

function classifyPrefixAndKeywords(
  trimmed: string,
  prefixe: string[],
  keywords: string[],
  prefixLabel: string,
  keywordLabel: string,
  treffer: string[]
): boolean {
  for (const p of prefixe) {
    if (prefixMatchesText(trimmed, p)) {
      treffer.push(`${prefixLabel}: „${p}"`);
      return true;
    }
  }
  for (const kw of keywords) {
    if (keywordMatchesText(trimmed, kw)) {
      treffer.push(`${keywordLabel}: „${kw}"`);
      return true;
    }
  }
  return false;
}

export function istKrematoriumOrt(ort: string, settings: DispositionSettings): boolean {
  return (
    ortMatchesPrefixe(ort, settings.kremationPrefixe) ||
    ortMatchesKeywords(ort, settings.kremationKeywords)
  );
}

export function istKrankenhausOrt(ort: string, settings: DispositionSettings): boolean {
  return (
    ortMatchesPrefixe(ort, settings.krankenhausPrefixe) ||
    ortMatchesKeywords(ort, settings.krankenhausKeywords)
  );
}

export function istPflegeheimOrt(ort: string, settings: DispositionSettings): boolean {
  return (
    ortMatchesPrefixe(ort, settings.pflegeheimPrefixe) ||
    ortMatchesKeywords(ort, settings.pflegeheimKeywords)
  );
}

export function istBestattungOrt(ort: string, settings: DispositionSettings): boolean {
  return (
    ortMatchesPrefixe(ort, settings.bestattungPrefixe) ||
    ortMatchesKeywords(ort, settings.bestattungKeywords)
  );
}

export function matchEigenerKuehlraumOrt(
  ort: string,
  settings: DispositionSettings
): EigenerKuehlraumConfig | null {
  const lower = ort.trim().toLowerCase();
  for (const kr of settings.eigeneKuehlraeume) {
    if (kr.alamidaName?.trim()) {
      const name = kr.alamidaName.trim().toLowerCase();
      if (lower === name || lower.includes(name)) return kr;
    }
    for (const kw of kr.matchKeywords) {
      if (keywordMatchesText(ort, kw)) return kr;
    }
  }
  const generic = /kühlr?\.?|kuehlr?\.?/i;
  if (generic.test(ort) && settings.eigeneKuehlraeume.length > 0) {
    return settings.eigeneKuehlraeume[0];
  }
  return null;
}

/** Vollständige Klassifikation eines Ortsnamens (für Prüfen-UI). */
export function classifyOrt(ort: string, settings: DispositionSettings): OrtErkennungErgebnis {
  const trimmed = ort.trim();
  const treffer: string[] = [];

  if (!trimmed) {
    return {
      ort: '',
      kremation: false,
      krankenhaus: false,
      pflegeheim: false,
      bestattung: false,
      eigenerKuehlraum: null,
      treffer: [],
    };
  }

  const kremation = classifyPrefixAndKeywords(
    trimmed,
    settings.kremationPrefixe,
    settings.kremationKeywords,
    'Kremation-Präfix',
    'Kremation',
    treffer
  );

  const krankenhaus = classifyPrefixAndKeywords(
    trimmed,
    settings.krankenhausPrefixe,
    settings.krankenhausKeywords,
    'KH-Präfix',
    'Krankenhaus',
    treffer
  );

  const pflegeheim = classifyPrefixAndKeywords(
    trimmed,
    settings.pflegeheimPrefixe,
    settings.pflegeheimKeywords,
    'Pflegeheim-Präfix',
    'Pflegeheim',
    treffer
  );

  const bestattung = classifyPrefixAndKeywords(
    trimmed,
    settings.bestattungPrefixe,
    settings.bestattungKeywords,
    'Bestattung-Präfix',
    'Bestattung',
    treffer
  );

  const eigenerKuehlraum = matchEigenerKuehlraumOrt(trimmed, settings);
  if (eigenerKuehlraum) {
    treffer.push(`Eigener KR: ${eigenerKuehlraum.label}`);
  }

  return {
    ort: trimmed,
    kremation,
    krankenhaus,
    pflegeheim,
    bestattung,
    eigenerKuehlraum,
    treffer,
  };
}
