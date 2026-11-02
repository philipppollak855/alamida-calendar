import type { EigenerKuehlraumConfig, KuehlraumWandTab } from '../types/dispositionSettings';

export type { KuehlraumWandTab };

export function normalizeKuehlraumWandTab(raw?: string): KuehlraumWandTab {
  return raw === 'extern' ? 'extern' : 'kuehlraum';
}

export function filterKuehlraeumeFuerWandTab(
  kuehlraeume: EigenerKuehlraumConfig[],
  tab: KuehlraumWandTab
): EigenerKuehlraumConfig[] {
  return kuehlraeume.filter((k) => normalizeKuehlraumWandTab(k.wandTab) === tab);
}
