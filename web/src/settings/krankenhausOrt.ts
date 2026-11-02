import type { Sterbefall } from '../types';
import type { DispositionSettings } from '../types/dispositionSettings';
import { getAbholungSchrittRef, getEffectiveAusstehend } from '../board/ausstehendEffective';
import { isAusstehendHeuteOrGeplant } from '../board/ausstehendStatus';
import { parseUeberfuehrungRoute } from '../board/routeParse';
import { getDispositionSettings } from './dispositionSettingsStore';
import { istBestattungOrt, istKrankenhausOrt, matchEigenerKuehlraumOrt } from './recognitionEngine';

function istKrankenhaus(ort?: string): boolean {
  if (!ort?.trim()) return false;
  return istKrankenhausOrt(ort, getDispositionSettings());
}

const FALLBACK_PREFIXE = ['uk ', 'uk-', 'uk.', 'kh ', 'kh-', 'kh.'];

const GENERIC_KH_KEYS = new Set([
  'uk',
  'kh',
  'k',
  'krankenhaus',
  'spital',
  'klinik',
  'klinikum',
  'landesklinik',
  'universitaetsklinik',
  'universitätsklinik',
]);

/** UK/KH/Krankenhaus… am Anfang (inkl. „UK - “). */
const LEADING_MARKER = /^(uk|kh|uk\.|kh\.)[\s.\-_]+/i;
const LEADING_KH_WORD =
  /^(krankenhaus|spital|klinik|landesklinik|universitätsklinik|universitaetsklinik|klinikum)[\s.\-_]+/i;

function stripLeadingMarkers(s: string): string {
  let prev = '';
  let cur = s;
  while (cur !== prev) {
    prev = cur;
    cur = cur
      .replace(LEADING_MARKER, '')
      .replace(LEADING_KH_WORD, '')
      .trim();
  }
  return cur;
}

export function isGenericKrankenhausKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  return !k || k.length < 3 || GENERIC_KH_KEYS.has(k);
}

/**
 * Gruppierungsschlüssel — gleiche Klinik trotz UK/KH/Krankenhaus/Schreibweise.
 */
function krankenhausOrtBasis(ort: string): string {
  const { von } = parseUeberfuehrungRoute(ort);
  return (von || ort).trim();
}

export function krankenhausOrtKey(ort: string, settings?: DispositionSettings): string {
  let s = krankenhausOrtBasis(ort).toLowerCase();
  s = stripLeadingMarkers(s);

  const cfg = settings ?? getDispositionSettings();
  const prefixe = [
    ...cfg.krankenhausPrefixe.map((p) => p.trim().toLowerCase()),
    ...FALLBACK_PREFIXE,
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const p of prefixe) {
    if (s.startsWith(p)) {
      s = s.slice(p.length);
      break;
    }
  }

  s = stripLeadingMarkers(s);

  for (const kw of cfg.krankenhausKeywords) {
    const k = kw.trim().toLowerCase();
    if (!k) continue;
    if (s.startsWith(k)) {
      s = s.slice(k.length).replace(/^[\s.\-_]+/, '');
    }
    if (s.endsWith(k)) {
      s = s.slice(0, -k.length).replace(/[\s.\-_]+$/, '');
    }
  }

  s = stripLeadingMarkers(s);
  s = s.replace(/^[\s.\-_]+/, '').replace(/[\s.\-_]+$/g, '');
  s = s.replace(/\s+/g, ' ').trim();

  const raw = krankenhausOrtBasis(ort).toLowerCase().replace(/\s+/g, ' ').trim();
  const result = s || raw;
  if (isGenericKrankenhausKey(result)) return result;
  return result;
}

function titleCaseOrt(key: string): string {
  if (!key) return key;
  return key
    .split(/[\s.\-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Einheitliche Kartenüberschrift für Extern, z. B. „UK - Neunkirchen“. */
export function canonicalKrankenhausAnzeigeLabel(
  ort: string,
  settings?: DispositionSettings
): string {
  const cfg = settings ?? getDispositionSettings();
  const ukNames = extractUkKlinikFromTexts(ort);
  if (ukNames.length > 0 && looksLikeStreetAddress(ort)) {
    return canonicalKrankenhausAnzeigeLabel(ukNames[0]!, cfg);
  }

  const basis = krankenhausOrtBasis(ort).replace(/\s+/g, ' ').trim();
  const key = krankenhausOrtKey(ort, settings);
  if (isGenericKrankenhausKey(key)) return basis || ort.replace(/\s+/g, ' ').trim();

  if (/^uk\s*[-–]\s*/i.test(basis)) return basis;

  const cityFromBasis = basis.replace(/^uk\s*[-–]\s*/i, '').trim();
  const city = cityFromBasis ? titleCaseOrt(cityFromBasis) : titleCaseOrt(key);
  if (!city) return basis || ort.replace(/\s+/g, ' ').trim();
  return `UK - ${city}`;
}

function gatherSterbefallTexts(s: Sterbefall): string {
  const parts: string[] = [];
  const push = (v?: string) => {
    if (v?.trim()) parts.push(v.trim());
  };
  push(s.abholort);
  push(s.aktuellePosition);
  push(s.naechsterSchrittVon);
  push(s.naechsterSchrittNach);
  push(s.naechsteUeberfuehrungVon);
  push(s.naechsteUeberfuehrungNach);
  for (const v of s.verlauf ?? []) {
    push(v.ort);
    push(v.vonOrt);
    push(v.nachOrt);
  }
  for (const a of s.ausstehend ?? []) {
    push(a.vonOrt);
    push(a.nachOrt);
  }
  return parts.join('\n');
}

/** UK-Kliniknamen aus beliebigen Textfeldern (auch wenn Sterbeort nur „UK“ ist). */
export function extractUkKlinikFromTexts(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (name: string) => {
    const t = name.replace(/\s+/g, ' ').trim();
    if (!t || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    found.push(t);
  };

  for (const line of text.split('\n')) {
    const head = line.split(/\s+\/\s+/)[0]?.trim() ?? '';
    if (/^UK\b/i.test(head)) add(head);
  }

  const reDash = /\bUK\s*[-–]\s*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.-]{1,30})/gi;
  let m: RegExpExecArray | null;
  while ((m = reDash.exec(text))) {
    add(`UK - ${m[1].trim()}`);
  }

  const reSpace = /\bUK\s+([A-Za-zÄÖÜäöüß]{4,30})/gi;
  while ((m = reSpace.exec(text))) {
    const city = m[1].trim();
    if (!/^(nach|und|die)$/i.test(city)) add(`UK ${city}`);
  }

  return found;
}

/** Abholung (Tab Termine, Zeile 1) — nicht „Angabe zum Sterbeort“ (Feld sterbeort). */
export function collectAbholungSterbeortKandidaten(s: Sterbefall): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (v?: string, force = false) => {
    const t = v?.trim();
    if (!t) return;
    const norm = t.toLowerCase();
    if (seen.has(norm)) return;
    if (!force && !istKrankenhaus(t)) return;
    seen.add(norm);
    out.push(t);

    const route = parseUeberfuehrungRoute(t);
    if (route.von && route.von !== t) add(route.von, force || istKrankenhaus(route.von));
    if (route.nach && route.nach !== t) add(route.nach, force || istKrankenhaus(route.nach));
  };

  add(s.abholort, true);

  const abholungSchritt = getAbholungSchrittRef(s);
  if (abholungSchritt?.vonOrt) add(abholungSchritt.vonOrt, true);
  if (abholungSchritt?.nachOrt) add(abholungSchritt.nachOrt, true);

  const textSource = [
    s.abholort,
    abholungSchritt?.vonOrt,
    abholungSchritt?.nachOrt,
    s.naechsterSchrittVon,
    s.naechsterSchrittNach,
  ]
    .filter(Boolean)
    .join('\n');
  for (const ukName of extractUkKlinikFromTexts(textSource)) {
    add(ukName, true);
  }

  const routeKh = findKhRouteZuEigeneKrInFall(s);
  if (routeKh) add(routeKh, true);

  return out;
}

/** @deprecated Alias — nur Abholung (Termine), siehe {@link collectAbholungSterbeortKandidaten}. */
export const collectSterbeortKrankenhausKandidaten = collectAbholungSterbeortKandidaten;

/** Straßen/PLZ-Zeilen nicht als Klinikname verwenden. */
export function looksLikeStreetAddress(ort: string): boolean {
  const t = ort.trim();
  if (!t || /^UK\b/i.test(t)) return false;
  if (/\b\d{4,5}\b/.test(t)) return true;
  if (/\b(str\.|straße|strasse|gasse|ring|weg|platz|allee|hof)\b/i.test(t)) return true;
  return /\d+[a-z]?\b/i.test(t) && t.length > 18;
}

function zielIstEigenerKuehlraumNach(nach?: string, cfg?: DispositionSettings): boolean {
  const t = nach?.trim();
  if (!t) return false;
  return !!matchEigenerKuehlraumOrt(t, cfg ?? getDispositionSettings());
}

function khVonAusSchrittText(vonRaw?: string, cfg?: DispositionSettings): string | null {
  const raw = vonRaw?.trim();
  if (!raw) return null;
  const { von } = parseUeberfuehrungRoute(raw);
  const candidate = (von || raw).trim();
  const settings = cfg ?? getDispositionSettings();
  if (istBestattungOrt(candidate, settings)) return null;
  return istKrankenhaus(candidate) ? candidate : null;
}

function pushRouteText(seen: Set<string>, out: string[], v?: string) {
  const t = v?.trim();
  if (!t) return;
  const norm = t.toLowerCase();
  if (seen.has(norm)) return;
  seen.add(norm);
  out.push(t);
}

/** Offene UK/KH→KR-Routen (ohne abgeschlossenen Verlauf). */
function collectOpenKhRouteTexte(s: Sterbefall, cfg: DispositionSettings): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const a of getEffectiveAusstehend(s)) {
    if (a.status !== 'abholung_noetig' && !isAusstehendHeuteOrGeplant(a)) continue;
    const von = a.vonOrt?.trim();
    if (!von) continue;
    const nach = a.nachOrt?.trim() || parseUeberfuehrungRoute(von).nach?.trim();
    if (nach && zielIstEigenerKuehlraumNach(nach, cfg)) {
      pushRouteText(seen, out, von.includes('nach') ? von : `${von} nach ${nach}`);
    } else {
      pushRouteText(seen, out, von);
    }
  }

  const nsVon = s.naechsterSchrittVon?.trim();
  const nsNach = s.naechsterSchrittNach?.trim();
  if (nsVon) {
    if (nsNach && zielIstEigenerKuehlraumNach(nsNach, cfg)) {
      pushRouteText(seen, out, nsVon.includes('nach') ? nsVon : `${nsVon} nach ${nsNach}`);
    } else {
      pushRouteText(seen, out, nsVon);
    }
  }

  const nuVon = s.naechsteUeberfuehrungVon?.trim();
  const nuNach = s.naechsteUeberfuehrungNach?.trim();
  if (nuVon) {
    if (nuNach && zielIstEigenerKuehlraumNach(nuNach, cfg)) {
      pushRouteText(seen, out, nuVon.includes('nach') ? nuVon : `${nuVon} nach ${nuNach}`);
    } else {
      pushRouteText(seen, out, nuVon);
    }
  }

  const abhol = s.abholort?.trim();
  if (abhol) {
    const route = parseUeberfuehrungRoute(abhol);
    const nach = route.nach?.trim() || nsNach || nuNach || '';
    if (nach && zielIstEigenerKuehlraumNach(nach, cfg)) {
      pushRouteText(seen, out, abhol);
    }
  }

  return out;
}

function extractKhVonRouteZuEigeneKr(
  raw: string,
  cfg: DispositionSettings
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const route = parseUeberfuehrungRoute(trimmed);
  const nachZiel = route.nach?.trim() ?? '';
  if (!nachZiel || !zielIstEigenerKuehlraumNach(nachZiel, cfg)) return null;

  const von = (route.von || trimmed).trim();
  const khVon = khVonAusSchrittText(von, cfg);
  if (!khVon) return null;
  return resolveBestKrankenhausOrt([khVon], cfg) ?? krankenhausOrtBasis(khVon);
}

/**
 * UK/KH → eigenes KR aus beliebigem Schritt-Feld (auch wenn Abholort fehlt
 * oder nur spätere Überführungen in ausstehend stehen).
 */
export function findKhRouteZuEigeneKrInFall(
  s: Sterbefall,
  settings?: DispositionSettings
): string | null {
  const cfg = settings ?? getDispositionSettings();
  for (const raw of collectOpenKhRouteTexte(s, cfg)) {
    const kh = extractKhVonRouteZuEigeneKr(raw, cfg);
    if (kh) return kh;
  }
  return null;
}

export function hatKhRouteZuEigeneKrInFall(s: Sterbefall): boolean {
  return findKhRouteZuEigeneKrInFall(s) != null;
}

/** Von-UK bei offener Überführung ins eigene KR (heute/geplant). */
function resolvePendingKhVonForEigeneKr(s: Sterbefall, cfg: DispositionSettings): string | null {
  for (const a of getEffectiveAusstehend(s)) {
    const vonRaw = a.vonOrt?.trim();
    const nachRaw = a.nachOrt?.trim();
    const route = parseUeberfuehrungRoute(vonRaw ?? '');
    const nachZiel = nachRaw || route.nach || '';
    if (!zielIstEigenerKuehlraumNach(nachZiel, cfg)) continue;
    if (a.status !== 'abholung_noetig' && !isAusstehendHeuteOrGeplant(a)) continue;
    const khVon = khVonAusSchrittText(vonRaw, cfg);
    if (!khVon) continue;
    return resolveBestKrankenhausOrt([khVon], cfg) ?? krankenhausOrtBasis(khVon);
  }

  const pairs: [string | undefined, string | undefined][] = [
    [s.naechsterSchrittVon, s.naechsterSchrittNach],
    [s.naechsteUeberfuehrungVon, s.naechsteUeberfuehrungNach],
  ];
  for (const [von, nach] of pairs) {
    const vonRaw = von?.trim();
    if (!vonRaw) continue;
    const route = parseUeberfuehrungRoute(vonRaw);
    const nachZiel = nach?.trim() || route.nach || '';
    if (!zielIstEigenerKuehlraumNach(nachZiel, cfg)) continue;
    const khVon = khVonAusSchrittText(vonRaw, cfg);
    if (!khVon) continue;
    return resolveBestKrankenhausOrt([khVon], cfg) ?? krankenhausOrtBasis(khVon);
  }

  if (s.abholortIstKrankenhaus && s.abholort?.trim()) {
    const nach =
      s.naechsterSchrittNach?.trim() ||
      s.naechsteUeberfuehrungNach?.trim() ||
      parseUeberfuehrungRoute(s.abholort).nach?.trim();
    if (nach && zielIstEigenerKuehlraumNach(nach, cfg)) {
      const khVon = khVonAusSchrittText(s.abholort, cfg);
      if (khVon) {
        return resolveBestKrankenhausOrt([khVon], cfg) ?? krankenhausOrtBasis(khVon);
      }
    }
  }

  return null;
}

/** Position, Termine, Verlauf — nachrangig zum Sterbeort-Feld. */
export function collectTerminKrankenhausKandidaten(s: Sterbefall): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (v?: string, force = false) => {
    const t = v?.trim();
    if (!t) return;
    const norm = t.toLowerCase();
    if (seen.has(norm)) return;
    if (!force && !istKrankenhaus(t)) return;
    seen.add(norm);
    out.push(t);

    const route = parseUeberfuehrungRoute(t);
    if (route.von && route.von !== t) add(route.von, force || istKrankenhaus(route.von));
    if (route.nach && route.nach !== t) add(route.nach, force || istKrankenhaus(route.nach));
  };

  add(s.aktuellePosition);
  add(s.abholort, !!s.abholortIstKrankenhaus);
  add(s.naechsterSchrittVon);
  add(s.naechsterSchrittNach);
  add(s.naechsteUeberfuehrungVon);
  add(s.naechsteUeberfuehrungNach);

  for (const v of s.verlauf ?? []) {
    add(v.ort);
    add(v.vonOrt);
    add(v.nachOrt);
  }
  for (const a of s.ausstehend ?? []) {
    add(a.vonOrt);
    add(a.nachOrt);
  }

  const detailText = s.abholort?.trim() ?? '';
  const terminText = gatherSterbefallTexts(s);
  for (const ukName of extractUkKlinikFromTexts(`${detailText}\n${terminText}`)) {
    add(ukName, true);
  }

  return out;
}

/** Alle Orts-Strings eines Falls, die ein KH bezeichnen können. */
export function collectKrankenhausKandidaten(s: Sterbefall): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const k of [...collectAbholungSterbeortKandidaten(s), ...collectTerminKrankenhausKandidaten(s)]) {
    const norm = k.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    merged.push(k);
  }
  return merged;
}

/**
 * Krankenhaus-Label für Extern/Gruppierung: Abholung (Termine) vor übrigen Terminfeldern.
 */
export function resolveKrankenhausOrtForFall(
  s: Sterbefall,
  settings?: DispositionSettings
): string | null {
  const cfg = settings ?? getDispositionSettings();

  const pendingKh = resolvePendingKhVonForEigeneKr(s, cfg);
  if (pendingKh) return pendingKh;

  const routeKh = findKhRouteZuEigeneKrInFall(s, cfg);
  if (routeKh) return routeKh;

  const fromAbholung = resolveBestKrankenhausOrt(collectAbholungSterbeortKandidaten(s), cfg);
  if (fromAbholung) return fromAbholung;

  return resolveBestKrankenhausOrt(collectTerminKrankenhausKandidaten(s), cfg);
}

/** Bester Ortsname für Gruppierung (längster spezifischer Schlüssel, nicht nur „UK“). */
export function resolveBestKrankenhausOrt(
  kandidaten: string[],
  settings?: DispositionSettings
): string | null {
  if (kandidaten.length === 0) return null;

  const cfg = settings ?? getDispositionSettings();

  // „UK - Neunkirchen / Kühlr. …“ — von-Teil hat Vorrang vor kaputtem „UK“-Sterbeort
  let bestRouteVon: string | null = null;
  let bestRouteKeyLen = -1;
  for (const ort of kandidaten) {
    const { von, nach } = parseUeberfuehrungRoute(ort);
    if (!nach || !von || !istKrankenhaus(von)) continue;
    const basis = krankenhausOrtBasis(von);
    const key = krankenhausOrtKey(basis, cfg);
    if (isGenericKrankenhausKey(key)) continue;
    if (key.length > bestRouteKeyLen) {
      bestRouteKeyLen = key.length;
      bestRouteVon = basis;
    }
  }
  if (bestRouteVon) return bestRouteVon;

  const ukNamed = kandidaten.filter((k) => {
    const basis = krankenhausOrtBasis(k).trim();
    if (!/^UK\b/i.test(basis)) return false;
    const key = krankenhausOrtKey(basis, cfg);
    return !isGenericKrankenhausKey(key) && !looksLikeStreetAddress(basis);
  });
  if (ukNamed.length > 0) {
    const picked = pickLongestKhKeyCandidate(ukNamed, cfg);
    if (picked) return picked;
  }

  let bestOrt: string | null = null;
  let bestKeyLen = -1;

  for (const ort of kandidaten) {
    const basis = krankenhausOrtBasis(ort);
    if (looksLikeStreetAddress(basis)) continue;
    const key = krankenhausOrtKey(basis, cfg);
    if (isGenericKrankenhausKey(key)) continue;
    if (key.length > bestKeyLen) {
      bestKeyLen = key.length;
      bestOrt = basis;
    }
  }

  if (bestOrt) return bestOrt;

  const khKandidaten = kandidaten
    .filter((k) => istKrankenhaus(k))
    .map((k) => krankenhausOrtBasis(k))
    .sort((a, b) => {
      const ka = krankenhausOrtKey(a, cfg);
      const kb = krankenhausOrtKey(b, cfg);
      const aSpec = isGenericKrankenhausKey(ka) ? 0 : ka.length;
      const bSpec = isGenericKrankenhausKey(kb) ? 0 : kb.length;
      if (bSpec !== aSpec) return bSpec - aSpec;
      return b.length - a.length;
    });

  for (const candidate of khKandidaten) {
    if (looksLikeStreetAddress(candidate)) continue;
    if (!isGenericKrankenhausKey(krankenhausOrtKey(candidate, cfg))) return candidate;
  }

  const ukFallback = khKandidaten.find((k) => /^UK\b/i.test(krankenhausOrtBasis(k).trim()));
  if (ukFallback) return krankenhausOrtBasis(ukFallback);

  return khKandidaten.find((k) => !looksLikeStreetAddress(k)) ?? khKandidaten[0] ?? null;
}

function pickLongestKhKeyCandidate(kandidaten: string[], cfg: DispositionSettings): string | null {
  let bestOrt: string | null = null;
  let bestKeyLen = -1;
  for (const ort of kandidaten) {
    const basis = krankenhausOrtBasis(ort);
    const key = krankenhausOrtKey(basis, cfg);
    if (isGenericKrankenhausKey(key)) continue;
    if (key.length > bestKeyLen) {
      bestKeyLen = key.length;
      bestOrt = basis;
    }
  }
  return bestOrt;
}

/** Benannte KH-Gruppe für einen Fall mit nur generischem „UK“-Schlüssel. */
export function matchNamedKrankenhausGruppe(
  s: Sterbefall,
  namedGruppenKeys: { key: string; slug: string }[]
): string | null {
  const kandidaten = collectKrankenhausKandidaten(s);
  const slugSet = new Set(
    kandidaten.map((k) => krankenhausOrtKey(krankenhausOrtBasis(k)))
  );

  for (const { key, slug } of namedGruppenKeys) {
    if (slugSet.has(slug)) return key;
  }

  for (const k of kandidaten) {
    const { von } = parseUeberfuehrungRoute(k);
    if (!von) continue;
    const vonSlug = krankenhausOrtKey(von);
    if (isGenericKrankenhausKey(vonSlug)) continue;
    const hit = namedGruppenKeys.find((g) => g.slug === vonSlug);
    if (hit) return hit.key;
  }

  for (const { key, slug } of namedGruppenKeys) {
    for (const k of kandidaten) {
      const t = krankenhausOrtBasis(k).toLowerCase();
      const city = titleCaseOrt(slug).toLowerCase();
      if (city.length >= 3 && t.includes(city)) return key;
    }
  }

  return null;
}

export function preferKrankenhausAnzeigeLabel(a: string, b: string): string {
  return canonicalKrankenhausAnzeigeLabel(a.length >= b.length ? a : b);
}
