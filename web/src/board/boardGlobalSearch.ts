import type { BoardSection } from './boardSections';
import type { KuehlraumSlotGrid } from './boardUtils';
import { fallAbschlussGrundLabel } from './fallAbschluss';
import { matchSterbefallQuery, matchTransferQuery, normalizeBoardSearch } from './boardSearch';
import { istInHistory } from './historieLogic';
import { isImEigenenKuehlraum } from './kuehlraumLogic';
import { resolveSlotKuehlraumId } from './kuehlplatzSlots';
import type { OffeneUeberfuehrungRow, Sterbefall } from '../types';
import type { UrnenEintrag } from './urnenLogic';

export type BoardSearchHitKind = 'fall' | 'kuehlraum' | 'ueberfuehrung' | 'urne';

export interface BoardSearchHit {
  id: string;
  kind: BoardSearchHitKind;
  title: string;
  subtitle?: string;
  tab: BoardSection;
  badge?: string;
}

const KIND_LABEL: Record<BoardSearchHitKind, string> = {
  fall: 'Fall',
  kuehlraum: 'Kühlraum',
  ueberfuehrung: 'Überführung',
  urne: 'Urne',
};

export function boardSearchKindLabel(kind: BoardSearchHitKind): string {
  return KIND_LABEL[kind];
}

export function buildBoardSearchHits(
  rawQuery: string,
  sterbefaelle: Sterbefall[],
  offene: OffeneUeberfuehrungRow[],
  urnen: UrnenEintrag[],
  kuehlraumGrids: KuehlraumSlotGrid[],
  /** Inkl. abgeschlossene Fälle für die Suche (z. B. gesamte Firestore-Liste). */
  sterbefaelleAlle?: Sterbefall[]
): BoardSearchHit[] {
  const q = normalizeBoardSearch(rawQuery);
  if (!q) return [];

  const hits: BoardSearchHit[] = [];
  const seenFall = new Set<string>();

  for (const { cfg, slots } of kuehlraumGrids) {
    slots.forEach((fall, i) => {
      if (!fall || !matchSterbefallQuery(fall, q)) return;
      seenFall.add(fall.id);
      hits.push({
        id: `kr-${fall.id}`,
        kind: 'kuehlraum',
        title: fall.verstorbenerName || fall.sterbefallId || fall.id,
        subtitle: `${cfg.label} · Platz ${i + 1}`,
        tab: 'lager',
        badge: fall.sterbefallId,
      });
    });
  }

  const faellePool = sterbefaelleAlle ?? sterbefaelle;
  for (const s of faellePool) {
    if (!matchSterbefallQuery(s, q)) continue;
    if (seenFall.has(s.id)) continue;
    const abgeschlossen = istInHistory(s);
    const imKr = !abgeschlossen && isImEigenenKuehlraum(s);
    const grundLabel = fallAbschlussGrundLabel(s.historieGrund ?? s.abschlussGrund);
    hits.push({
      id: `fall-${s.id}`,
      kind: 'fall',
      title: s.verstorbenerName || s.sterbefallId || s.id,
      subtitle: abgeschlossen
        ? [grundLabel, s.aktuellePosition].filter(Boolean).join(' · ')
        : (s.aktuellePosition ?? undefined),
      tab: imKr ? 'lager' : 'faelle',
      badge: s.sterbefallId,
    });
  }

  for (const row of offene) {
    if (!matchTransferQuery(row, q)) continue;
    hits.push({
      id: `tr-${row.docId}-${row.zeile}`,
      kind: 'ueberfuehrung',
      title: row.name,
      subtitle: `${row.vonOrt} → ${row.nachOrt} · ${row.terminAm}`,
      tab: 'ueberfuehrungen',
      badge: row.sterbefallId,
    });
  }

  for (const u of urnen) {
    const pseudo: Sterbefall = {
      id: u.docId,
      sterbefallId: u.sterbefallId,
      verstorbenerName: u.name,
    };
    if (!matchSterbefallQuery(pseudo, q)) continue;
    hits.push({
      id: `urne-${u.docId}`,
      kind: 'urne',
      title: u.name,
      subtitle: u.retourVon ? `Retour von ${u.retourVon}` : 'Urnen-Bereich',
      tab: 'lager',
      badge: u.sterbefallId,
    });
  }

  const order: BoardSearchHitKind[] = ['kuehlraum', 'ueberfuehrung', 'fall', 'urne'];
  hits.sort((a, b) => {
    const oa = order.indexOf(a.kind);
    const ob = order.indexOf(b.kind);
    if (oa !== ob) return oa - ob;
    return a.title.localeCompare(b.title, 'de');
  });

  return hits.slice(0, 24);
}

export function kuehlraumLabelForFall(
  fall: Sterbefall,
  grids: KuehlraumSlotGrid[]
): string | undefined {
  for (const { cfg, slots } of grids) {
    const idx = slots.findIndex((s) => s?.id === fall.id);
    if (idx >= 0) return `${cfg.label} · Platz ${idx + 1}`;
  }
  const krId = resolveSlotKuehlraumId(fall);
  const cfg = grids.find((g) => g.cfg.id === krId);
  if (cfg) return cfg.cfg.label;
  return undefined;
}
