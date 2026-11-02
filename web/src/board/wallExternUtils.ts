import type { AusstehendEintrag, Sterbefall } from '../types';
import { getEffectiveAusstehend, schrittZielIstEigeneKr } from './ausstehendEffective';
import { istInHistory } from './historieLogic';
import {
  canonicalKrankenhausAnzeigeLabel,
  collectKrankenhausKandidaten,
  isGenericKrankenhausKey,
  krankenhausOrtKey,
  matchNamedKrankenhausGruppe,
  hatKhRouteZuEigeneKrInFall,
  resolveKrankenhausOrtForFall,
} from '../settings/krankenhausOrt';
import { parseUeberfuehrungRoute } from './routeParse';
import { istBestattung, istKrankenhaus, istKrematorium, ortLabel } from './ortKeywords';
import { isAusstehendHeute, isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import {
  hatAusstehendeUeberfuehrungInsEigeneKr,
  isAmKrankenhausOderSterbeort,
  isImEigenenKuehlraum,
  zielIstEigenerKuehlraum,
} from './kuehlraumLogic';
import { istInUrnenBereich } from './urnenLogic';
import { istAktuellImKrematorium, letzteAbgeschlosseneEtappe } from './positionLogic';
import {
  externOrtAnzeigeLabel,
  hatAusstehendeUeberfuehrungVonExternemOrt,
  resolveExternAbholOrtLabel,
} from './externStandortLogic';
import {
  classifyExternKartenKategorie,
  externKategorieBadgeLabel,
  externKategorieGruppenKey,
  type ExternKartenKategorie,
} from './externKategorie';
import type { DispositionSettings } from '../types/dispositionSettings';
import { getDispositionSettings } from '../settings/dispositionSettingsStore';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import { resolveFallKuehlraumId } from './kuehlraumZuordnung';
import { filterKuehlraeumeFuerWandTab } from './kuehlraumWandTab';

export type { ExternKartenKategorie } from './externKategorie';
export { externKategorieBadgeLabel, externKategorieHatFreigabe } from './externKategorie';

export interface ExternFallEintrag {
  docId: string;
  sterbefallId: string;
  name: string;
  hinweis: string;
  terminAm?: string;
  /** Nur bei typ kremation — Retour → Urnen */
  kremationOrt?: string;
  /** Retour nur wenn physisch im Krematorium (nicht bei „Wartend“ / geplant). */
  kremationRetourErlaubt?: boolean;
  freigabeFrei?: boolean;
  freigabeDatum?: string;
}

export interface ExternOrtGruppe {
  key: string;
  typ: ExternKartenKategorie;
  ort: string;
  faelle: ExternFallEintrag[];
}

function isAktiv(s: Sterbefall): boolean {
  if (istInHistory(s)) return false;
  return s.aktivInAlamida !== false;
}

function hatOffeneAbholungVomSterbeort(s: Sterbefall): boolean {
  return getEffectiveAusstehend(s).some(
    (a) =>
      a.istAbholungVomSterbeort ||
      a.status === 'abholung_noetig' ||
      (a.schrittTyp === 'abholung' && isAusstehendHeuteOrGeplant(a))
  );
}

function naechsterSchritt(s: Sterbefall) {
  const offen = getEffectiveAusstehend(s).filter(
    (a) => a.status === 'abholung_noetig' || isAusstehendHeuteOrGeplant(a)
  );
  return offen[0];
}

type ExternSchrittRef = {
  schrittTyp?: string;
  vonOrt?: string;
  nachOrt?: string;
  terminAm?: string;
  abholungAm?: string;
  status?: string;
};

function istOffenerAusstehendSchritt(a: AusstehendEintrag): boolean {
  if (a.status === 'abholung_noetig') return true;
  return isAusstehendHeuteOrGeplant(a);
}

function findeKremationSchritt(s: Sterbefall): ExternSchrittRef | undefined {
  const kremAusstehend = getEffectiveAusstehend(s).find(
    (a) => a.schrittTyp === 'kremation' && istOffenerAusstehendSchritt(a)
  );
  if (kremAusstehend) return kremAusstehend;

  if (s.naechsterSchrittTyp === 'kremation') {
    return {
      schrittTyp: 'kremation',
      vonOrt: s.naechsterSchrittVon,
      nachOrt: s.naechsterSchrittNach,
      terminAm: s.naechsterSchrittAm,
    };
  }

  return undefined;
}

function naechsterKremationSchritt(s: Sterbefall): ExternSchrittRef | undefined {
  return findeKremationSchritt(s);
}

/** Erster offener Schritt, der nicht Kremation ist (für KH/Pflegeheim-Hinweise). */
function naechsterNichtKremationSchritt(s: Sterbefall): ExternSchrittRef | undefined {
  return getEffectiveAusstehend(s).find(
    (a) => a.schrittTyp !== 'kremation' && istOffenerAusstehendSchritt(a)
  );
}

function terminFuerSchritt(schritt?: ExternSchrittRef): string | undefined {
  const t = schritt?.terminAm?.trim() || schritt?.abholungAm?.trim();
  return t || undefined;
}

function ersterKrematoriumOrt(...candidates: (string | undefined)[]): string | null {
  for (const raw of candidates) {
    const t = raw?.trim();
    if (!t) continue;
    if (istKrematorium(t)) return ortLabel(t);
    const route = parseUeberfuehrungRoute(t);
    if (route.von && istKrematorium(route.von)) return ortLabel(route.von);
    if (route.nach && istKrematorium(route.nach)) return ortLabel(route.nach);
  }
  return null;
}

/** Kremation relevant für Extern (am Krematorium oder geplanter Kremationsschritt). */
function hatKremationExternBezug(s: Sterbefall): boolean {
  if (istAktuellImKrematorium(s)) return true;
  if (s.naechsterSchrittTyp === 'kremation') return true;
  if (s.endzielTyp === 'kremation' || (s.endziel && istKrematorium(s.endziel))) return true;
  return getEffectiveAusstehend(s).some(
    (a) =>
      a.schrittTyp === 'kremation' &&
      (a.status === 'abholung_noetig' || isAusstehendHeuteOrGeplant(a))
  );
}

function hinweisFuerFall(s: Sterbefall, typ: ExternKartenKategorie): string {
  if (typ === 'kremation') {
    if (istAktuellImKrematorium(s)) return 'Im Krematorium';

    const krem = findeKremationSchritt(s);
    if (krem) {
      const termin = terminFuerSchritt(krem);
      if (!termin) return 'Wartet auf Kremation';
      if (isAusstehendHeute(krem)) return 'Termin heute';
      return 'Kremation geplant';
    }

    return 'Wartend';
  }

  const n = naechsterNichtKremationSchritt(s) ?? naechsterSchritt(s);
  if (n?.schrittTyp !== 'kremation') {
    if (n && isAusstehendHeute(n)) return 'Termin heute';
    if (n?.status === 'abholung_noetig') return 'Abholung ausstehend';
    if (n?.schrittTyp === 'abholung') return 'Wartet auf Abholung';
  }

  if (s.aktuellePositionTyp === 'sterbeort' || isAmKrankenhausOderSterbeort(s)) {
    return 'Am Sterbeort';
  }

  if (hatAusstehendeUeberfuehrungInsEigeneKr(s)) return 'Überführung ohne Datum';
  return 'Wartend';
}

function kremationOrtLabel(s: Sterbefall): string | null {
  const kremSchritt = naechsterKremationSchritt(s);

  return (
    ersterKrematoriumOrt(
      s.aktuellePosition,
      kremSchritt?.vonOrt,
      kremSchritt?.nachOrt,
      s.naechsterSchrittVon,
      s.naechsterSchrittNach,
      s.naechsteUeberfuehrungVon,
      s.naechsteUeberfuehrungNach
    ) ??
    (() => {
      const letzte = letzteAbgeschlosseneEtappe(s);
      const ort = letzte?.nachOrt ?? letzte?.ort;
      return ort && istKrematorium(ort) ? ortLabel(ort) : null;
    })() ??
    (s.endziel && istKrematorium(s.endziel) ? ortLabel(s.endziel) : null) ??
    (() => {
      const raw =
        kremSchritt?.nachOrt ??
        kremSchritt?.vonOrt ??
        s.naechsterSchrittNach ??
        s.naechsterSchrittVon;
      return raw?.trim() ? ortLabel(raw) : null;
    })()
  );
}

function khVonAusUeberfuehrungstext(vonRaw?: string): string | null {
  const raw = vonRaw?.trim();
  if (!raw) return null;
  const { von } = parseUeberfuehrungRoute(raw);
  const candidate = (von || raw).trim();
  if (istBestattung(candidate)) return null;
  return istKrankenhaus(candidate) ? candidate : null;
}

/** UK/KH → eigenes KR, Termin heute oder geplant (nicht nur „ab morgen“). */
function hatOffeneKhUeberfuehrungInsEigeneKr(s: Sterbefall): boolean {
  return getEffectiveAusstehend(s).some((a) => {
    if (!schrittZielIstEigeneKr(a)) return false;
    if (!khVonAusUeberfuehrungstext(a.vonOrt)) return false;
    return a.status === 'abholung_noetig' || isAusstehendHeuteOrGeplant(a);
  });
}

/** Fallback: UK/KH→Firmen-KR kommt manchmal nur noch im `verlauf[]` vor. */
function hatKhRouteInVerlaufZuEigeneKr(s: Sterbefall): boolean {
  for (const v of s.verlauf ?? []) {
    const von = v.vonOrt?.trim() || v.ort?.trim();
    const nach = v.nachOrt?.trim() || v.ort?.trim();
    if (!von || !nach) continue;
    if (!khVonAusUeberfuehrungstext(von)) continue;
    if (!zielIstEigenerKuehlraum(nach)) continue;
    return true;
  }
  return false;
}

function istExternKrankenhausFall(s: Sterbefall): boolean {
  if (isImEigenenKuehlraum(s) || istAktuellImKrematorium(s)) return false;

  if (hatOffeneKhUeberfuehrungInsEigeneKr(s)) return true;

  if (hatKhRouteZuEigeneKrInFall(s)) return true;

  const pos = s.aktuellePosition?.trim();
  if (pos && istKrankenhaus(pos)) return true;

  if (
    getEffectiveAusstehend(s).some((a) => {
      if (!schrittZielIstEigeneKr(a)) return false;
      return !!khVonAusUeberfuehrungstext(a.vonOrt);
    })
  ) {
    return true;
  }

  const naechsterVon = s.naechsterSchrittVon?.trim();
  if (
    naechsterVon &&
    khVonAusUeberfuehrungstext(naechsterVon) &&
    (s.naechsterSchrittTyp === 'abholung' || s.naechsterSchrittTyp === 'ueberfuehrung') &&
    (schrittZielIstEigeneKr({
      vonOrt: naechsterVon,
      nachOrt: s.naechsterSchrittNach,
    }) ||
      hatKhRouteZuEigeneKrInFall(s))
  ) {
    return true;
  }

  if (s.aktuellePositionTyp === 'sterbeort' || hatAusstehendeUeberfuehrungInsEigeneKr(s)) {
    const khOrt = s.abholort;
    if (khOrt && istKrankenhaus(khOrt)) return true;
    if (getEffectiveAusstehend(s).some((a) => khVonAusUeberfuehrungstext(a.vonOrt)))
      return true;
  }

  if (
    (s.aktuellePositionTyp === 'sterbeort' || !s.aktuellePosition?.trim()) &&
    s.abholort &&
    istKrankenhaus(s.abholort)
  ) {
    return true;
  }

  if (hatOffeneAbholungVomSterbeort(s)) {
    const ort = s.abholort;
    if (ort && istKrankenhaus(ort)) return true;
    if (s.abholortIstKrankenhaus && s.abholort) return true;
  }

  const naechster = naechsterSchritt(s);
  if (naechster?.vonOrt && khVonAusUeberfuehrungstext(naechster.vonOrt)) {
    if (
      naechster.schrittTyp === 'abholung' ||
      naechster.schrittTyp === 'ueberfuehrung' ||
      schrittZielIstEigeneKr(naechster)
    ) {
      return true;
    }
  }

  if (isAmKrankenhausOderSterbeort(s)) {
    const fallback = s.abholort;
    if (fallback && istKrankenhaus(fallback) && !istBestattung(fallback)) return true;
    if (s.abholortIstKrankenhaus && s.abholort) return true;
  }

  if (
    s.abholortIstKrankenhaus &&
    s.abholort?.trim() &&
    (hatKhRouteZuEigeneKrInFall(s) || hatOffeneKhUeberfuehrungInsEigeneKr(s))
  ) {
    return true;
  }

  if (hatKhRouteInVerlaufZuEigeneKr(s)) return true;

  return false;
}

function normalizeEigenerKrZiel(s: Sterbefall): string | null {
  for (const a of getEffectiveAusstehend(s)) {
    if (zielIstEigenerKuehlraum(a.nachOrt)) return (a.nachOrt ?? '').trim().toLowerCase();
  }
  if (zielIstEigenerKuehlraum(s.naechsterSchrittNach)) {
    return s.naechsterSchrittNach!.trim().toLowerCase();
  }
  if (zielIstEigenerKuehlraum(s.naechsteUeberfuehrungNach)) {
    return s.naechsteUeberfuehrungNach!.trim().toLowerCase();
  }
  return null;
}

/** „UK“-Fall der passenden benannten Klinik zuordnen (Peer mit gleichem KR-Ziel). */
function inferNamedKhKeyForGenericFall(
  s: Sterbefall,
  namedMeta: { key: string; slug: string }[],
  alle: Sterbefall[]
): string | null {
  const direct = matchNamedKrankenhausGruppe(s, namedMeta);
  if (direct) return direct;

  const ziel = normalizeEigenerKrZiel(s);
  if (ziel) {
    for (const other of alle) {
      if (other.id === s.id) continue;
      if (normalizeEigenerKrZiel(other) !== ziel) continue;
      const peerKey = matchNamedKrankenhausGruppe(other, namedMeta);
      if (peerKey) return peerKey;
    }
  }

  if (namedMeta.length === 1) return namedMeta[0].key;
  return null;
}

function resolveKrankenhausStandort(
  s: Sterbefall,
  alle: Sterbefall[]
): { typ: ExternKartenKategorie; ort: string } | null {
  if (!istExternKrankenhausFall(s)) return null;

  let ort = resolveKrankenhausOrtForFall(s) ?? resolveExternAbholOrtLabel(s);
  if (!ort?.trim()) return null;

  if (isGenericKrankenhausKey(krankenhausOrtKey(ort))) {
    const namedMeta = alle
      .map((x) => {
        const o = resolveKrankenhausOrtForFall(x);
        if (!o || isGenericKrankenhausKey(krankenhausOrtKey(o))) return null;
        return { key: `krankenhaus:${krankenhausOrtKey(o)}`, slug: krankenhausOrtKey(o) };
      })
      .filter((x): x is { key: string; slug: string } => x != null);
    const unique = [...new Map(namedMeta.map((m) => [m.key, m])).values()];
    const inferredKey = inferNamedKhKeyForGenericFall(s, unique, alle);
    if (inferredKey) {
      const slug = inferredKey.replace(/^krankenhaus:/, '');
      const peer = alle.find((x) => {
        const o = resolveKrankenhausOrtForFall(x);
        return o && krankenhausOrtKey(o) === slug;
      });
      if (peer) {
        ort = resolveKrankenhausOrtForFall(peer) ?? ort;
      }
    }
  }

  return { typ: classifyExternKartenKategorie(ort), ort: ort.trim() };
}

/** Fälle mit nur „UK“/„KH“ der passenden benannten KH-Karte zuordnen (auch bei mehreren Kliniken). */
function mergeOrphanGenericKhGruppen(
  gruppen: ExternOrtGruppe[],
  sterbefaelle: Sterbefall[]
): ExternOrtGruppe[] {
  const kh = gruppen.filter((g) => g.typ === 'krankenhaus');
  const named = kh.filter((g) => {
    const slug = g.key.replace(/^krankenhaus:/, '');
    return !isGenericKrankenhausKey(slug);
  });
  const generic = kh.filter((g) => {
    const slug = g.key.replace(/^krankenhaus:/, '');
    return isGenericKrankenhausKey(slug);
  });

  if (generic.length === 0 || named.length === 0) return gruppen;

  const fallByDoc = new Map(sterbefaelle.map((s) => [s.id, s]));
  const namedMeta = named.map((g) => ({
    key: g.key,
    slug: g.key.replace(/^krankenhaus:/, ''),
    gruppe: g,
  }));

  for (const g of generic) {
    const unassigned: ExternFallEintrag[] = [];

    for (const f of g.faelle) {
      const s = fallByDoc.get(f.docId);
      const targetKey = s
        ? inferNamedKhKeyForGenericFall(s, namedMeta, sterbefaelle)
        : named.length === 1
          ? named[0].key
          : null;

      const target = targetKey
        ? namedMeta.find((n) => n.key === targetKey)?.gruppe
        : named.length === 1
          ? named[0]
          : null;

      if (target) {
        target.faelle.push(f);
        target.ort = canonicalKrankenhausAnzeigeLabel(target.ort);
      } else {
        unassigned.push(f);
      }
    }

    g.faelle = unassigned;
  }

  for (const g of named) {
    g.faelle.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  const emptyGenericKeys = new Set(
    generic.filter((g) => g.faelle.length === 0).map((g) => g.key)
  );
  return gruppen.filter((g) => !emptyGenericKeys.has(g.key));
}

/** Bestattung/Pflegeheim/sonstiges Extern → eigenes KR (nicht UK/KH). */
function resolveNichtKhExternStandort(
  s: Sterbefall
): { typ: ExternKartenKategorie; ort: string } | null {
  if (!hatAusstehendeUeberfuehrungVonExternemOrt(s)) return null;

  const label = resolveExternAbholOrtLabel(s);
  if (!label?.trim()) return null;
  if (istKrankenhaus(label)) return null;

  return { typ: classifyExternKartenKategorie(label), ort: label.trim() };
}

function resolveKremationStandort(
  s: Sterbefall
): { typ: 'kremation'; ort: string } | null {
  if (!hatKremationExternBezug(s)) return null;

  const ort = kremationOrtLabel(s);
  if (!ort) return null;

  return { typ: 'kremation', ort };
}

/**
 * Ermittelt externen Standort (Krankenhaus oder Krematorium), sofern der Verstorbene
 * nicht im eigenen Kühlraum liegt.
 */
function resolveExternStandorteCore(
  s: Sterbefall,
  alle: Sterbefall[]
): { typ: ExternKartenKategorie; ort: string }[] {
  if (!isAktiv(s) || istInUrnenBereich(s)) return [];

  const out: { typ: ExternKartenKategorie; ort: string }[] = [];
  const krem = resolveKremationStandort(s);
  if (krem) out.push(krem);

  if (!isImEigenenKuehlraum(s)) {
    const kh = resolveKrankenhausStandort(s, alle);
    if (kh) {
      out.push(kh);
    } else {
      const nichtKh = resolveNichtKhExternStandort(s);
      if (nichtKh) out.push(nichtKh);
    }
  }

  return out;
}

export function resolveExternStandort(
  s: Sterbefall
): { typ: ExternKartenKategorie; ort: string } | null {
  return resolveExternStandorteCore(s, [s])[0] ?? null;
}

function resolveExternStandorteWithAlle(
  s: Sterbefall,
  alle: Sterbefall[]
): { typ: ExternKartenKategorie; ort: string }[] {
  return resolveExternStandorteCore(s, alle);
}

function buildWandExternKuehlraumGruppen(
  sterbefaelle: Sterbefall[],
  settings: DispositionSettings
): ExternOrtGruppe[] {
  const gruppen: ExternOrtGruppe[] = [];

  for (const kr of filterKuehlraeumeFuerWandTab(settings.eigeneKuehlraeume, 'extern')) {
    const faelle: ExternFallEintrag[] = [];

    for (const s of sterbefaelle) {
      if (!isAktiv(s) || istInUrnenBereich(s)) continue;
      if (!isImEigenenKuehlraum(s)) continue;

      if (resolveFallKuehlraumId(s, settings) !== kr.id) continue;

      const id = s.sterbefallId ?? s.id;
      const platz = s.kuehlplatz?.trim();
      faelle.push({
        docId: s.id,
        sterbefallId: id,
        name: s.verstorbenerName ?? id,
        hinweis: platz ? `Platz ${platz}` : (s.aktuellePosition?.trim() || 'Im Kühlraum'),
        terminAm: s.naechsterSchrittAm,
        freigabeFrei: s.freigabeFrei === true,
        freigabeDatum: s.freigabeDatum?.trim() || undefined,
      });
    }

    if (faelle.length === 0) continue;
    faelle.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    gruppen.push({
      key: `kuehlraum-wand:${kr.id}`,
      typ: 'kuehlraum',
      ort: kr.label,
      faelle,
    });
  }

  return gruppen;
}

export function buildExternGruppen(
  sterbefaelle: Sterbefall[],
  options?: { settings?: DispositionSettings }
): ExternOrtGruppe[] {
  const settings = options?.settings ?? getDispositionSettings();

  const map = new Map<string, ExternOrtGruppe>();

  for (const s of sterbefaelle) {
    const standorte = resolveExternStandorteWithAlle(s, sterbefaelle);
    if (standorte.length === 0) continue;

    for (const standort of standorte) {
      const key =
        standort.typ === 'krankenhaus'
          ? `krankenhaus:${krankenhausOrtKey(standort.ort)}`
          : externKategorieGruppenKey(standort.typ, standort.ort);
      const id = s.sterbefallId ?? s.id;
      const name = s.verstorbenerName ?? id;
      const kremSchritt =
        standort.typ === 'kremation' ? findeKremationSchritt(s) : undefined;
      const n =
        standort.typ === 'kremation'
          ? kremSchritt
          : naechsterNichtKremationSchritt(s) ?? naechsterSchritt(s);

      const displayOrt =
        standort.typ === 'krankenhaus'
          ? externOrtAnzeigeLabel(standort.ort)
          : ortLabel(standort.ort);

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          typ: standort.typ,
          ort: displayOrt,
          faelle: [],
        });
      } else if (standort.typ === 'krankenhaus') {
        existing.ort = externOrtAnzeigeLabel(standort.ort);
      }

      map.get(key)!.faelle.push({
        docId: s.id,
        sterbefallId: id,
        name,
        hinweis: hinweisFuerFall(s, standort.typ),
        terminAm:
          standort.typ === 'kremation'
            ? terminFuerSchritt(kremSchritt)
            : terminFuerSchritt(n) ?? s.naechsterSchrittAm,
        kremationOrt: standort.typ === 'kremation' ? displayOrt : undefined,
        kremationRetourErlaubt:
          standort.typ === 'kremation' ? istAktuellImKrematorium(s) : undefined,
        freigabeFrei: s.freigabeFrei === true,
        freigabeDatum: s.freigabeDatum?.trim() || undefined,
      });
    }
  }

  let gruppen = [...map.values()];
  for (const g of gruppen) {
    g.faelle.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  gruppen = mergeOrphanGenericKhGruppen(gruppen, sterbefaelle);

  gruppen.push(...buildWandExternKuehlraumGruppen(sterbefaelle, settings));

  const typOrder: Record<ExternKartenKategorie, number> = {
    krankenhaus: 0,
    pflegeheim: 1,
    kuehlraum: 2,
    bestattung: 3,
    extern: 4,
    kremation: 5,
  };

  return gruppen.sort((a, b) => {
    const oa = typOrder[a.typ] ?? 9;
    const ob = typOrder[b.typ] ?? 9;
    if (oa !== ob) return oa - ob;
    return a.ort.localeCompare(b.ort, 'de');
  });
}

export function externGesamt(gruppen: ExternOrtGruppe[]): number {
  return gruppen.reduce((n, g) => n + g.faelle.length, 0);
}
