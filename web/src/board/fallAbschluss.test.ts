import { describe, expect, it } from 'vitest';
import { fallAbschlussGrundLabel, istManuellAusgeschlossen } from './fallAbschluss';
import { filterSterbefaelleFuerKalender } from './historieLogic';
import type { Sterbefall } from '../types';

describe('fallAbschluss', () => {
  it('erkennt manuelle Abschlussgründe', () => {
    expect(istManuellAusgeschlossen('uebergabe_anderer_bestatter')).toBe(true);
    expect(istManuellAusgeschlossen('beisetzung')).toBe(false);
  });

  it('liefert lesbare Labels', () => {
    expect(fallAbschlussGrundLabel('uebergabe_anderer_bestatter')).toBe(
      'Übergabe an anderen Bestatter'
    );
  });

  it('filtert abgeschlossene Fälle aus dem Kalender wie manuell entfernt', () => {
    const faelle: Sterbefall[] = [
      {
        id: '1',
        inHistory: true,
        historieGrund: 'uebergabe_anderer_bestatter',
        trauerfeierdatum: '10.06.2026',
      },
      {
        id: '2',
        inHistory: true,
        historieGrund: 'beisetzung',
        trauerfeierdatum: '10.06.2026',
      },
    ];
    const filtered = filterSterbefaelleFuerKalender(faelle);
    expect(filtered.map((f) => f.id)).toEqual(['2']);
  });
});
