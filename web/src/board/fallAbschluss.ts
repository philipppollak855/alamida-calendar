/** Manuelle Abschlussgründe — erscheinen nicht mehr in Disposition/Wand-Kühlraum. */
export const FALL_ABSCHLUSS_GRUENDE = [
  {
    id: 'uebergabe_anderer_bestatter',
    label: 'Übergabe an anderen Bestatter',
    hint: 'Fall wurde extern weitergeführt',
    icon: '↗',
  },
  {
    id: 'beisetzung_durch_dritte',
    label: 'Beisetzung durch Dritte',
    hint: 'Beisetzung ohne unsere Mitwirkung',
    icon: '✓',
  },
  {
    id: 'kremation_extern',
    label: 'Kremation extern',
    hint: 'Anderes Krematorium / Institut',
    icon: '◆',
  },
  {
    id: 'storniert',
    label: 'Storniert / kein Auftrag',
    hint: 'Auftrag entfallen oder nie erteilt',
    icon: '×',
  },
  {
    id: 'sonstiges',
    label: 'Sonstiges',
    hint: 'Mit kurzer Bemerkung',
    icon: '…',
  },
] as const;

export type FallAbschlussGrund = (typeof FALL_ABSCHLUSS_GRUENDE)[number]['id'];

const GRUND_IDS = new Set<string>(FALL_ABSCHLUSS_GRUENDE.map((g) => g.id));

export function isFallAbschlussGrund(value: string): value is FallAbschlussGrund {
  return GRUND_IDS.has(value);
}

export function fallAbschlussGrundLabel(grund?: string): string {
  if (!grund?.trim()) return 'Abgeschlossen';
  const hit = FALL_ABSCHLUSS_GRUENDE.find((g) => g.id === grund);
  if (hit) return hit.label;
  if (grund === 'manuell_entfernt') return 'Manuell entfernt';
  return grund;
}

/** Vom Team manuell aus der aktiven Disposition genommen. */
export function istManuellAusgeschlossen(grund?: string): boolean {
  if (!grund?.trim()) return false;
  if (grund === 'manuell_entfernt') return true;
  return isFallAbschlussGrund(grund);
}
