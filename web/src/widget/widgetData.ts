import type { Sterbefall } from '../types';
import { filterAktiveSterbefaelle } from '../board/historieLogic';
import {
  boardStats,
  buildAlleEigeneKuehlraumSlots,
  flattenOffene,
  kuehlraumGesamtBelegung,
} from '../board/boardUtils';
import { getDispositionSettings } from '../settings/dispositionSettingsStore';
import { buildExternGruppen, externGesamt } from '../board/wallExternUtils';

export type WidgetKind = 'summary' | 'kuehlraum' | 'extern' | 'heute';

export function parseWidgetKind(raw?: string): WidgetKind {
  if (raw === 'kuehlraum' || raw === 'extern' || raw === 'heute' || raw === 'summary') {
    return raw;
  }
  return 'summary';
}

export function buildWidgetSnapshot(sterbefaelleRaw: Sterbefall[]) {
  const sterbefaelle = filterAktiveSterbefaelle(sterbefaelleRaw);
  const offene = flattenOffene(sterbefaelle);
  const stats = boardStats(sterbefaelle, offene);
  const settings = getDispositionSettings();
  const kuehlraumGrids = buildAlleEigeneKuehlraumSlots(sterbefaelle, settings.eigeneKuehlraeume);
  const { belegt, plaetze } = kuehlraumGesamtBelegung(kuehlraumGrids);
  const externGruppen = buildExternGruppen(sterbefaelle);
  const heute = offene.filter((o) => o.status === 'heute').slice(0, 6);

  const badgeCount = stats.heute + externGesamt(externGruppen);

  return {
    stats,
    kuehlraumGrids,
    belegt,
    plaetze,
    externGruppen,
    externTotal: externGesamt(externGruppen),
    heute,
    badgeCount,
  };
}
