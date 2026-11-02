export type BoardSection =
  | 'uebersicht'
  | 'ueberfuehrungen'
  | 'lager'
  | 'faelle'
  | 'einstellungen';

export const BOARD_SECTIONS: {
  id: BoardSection;
  label: string;
  short: string;
}[] = [
  { id: 'uebersicht', label: 'Übersicht', short: 'Start' },
  { id: 'ueberfuehrungen', label: 'Überführungen', short: 'Transport' },
  { id: 'lager', label: 'Lager', short: 'Lager' },
  { id: 'faelle', label: 'Fälle', short: 'Fälle' },
  { id: 'einstellungen', label: 'Einstellungen', short: 'Setup' },
];

export function parseBoardSection(value: string | null): BoardSection {
  if (
    value === 'ueberfuehrungen' ||
    value === 'lager' ||
    value === 'faelle' ||
    value === 'einstellungen'
  ) {
    return value;
  }
  return 'uebersicht';
}
