import { beforeEach, describe, expect, it } from 'vitest';
import type { Sterbefall } from '../types';
import type { EigenerKuehlraumConfig } from '../types/dispositionSettings';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import { setDispositionSettings } from '../settings/dispositionSettingsStore';
import { belegeKuehlraumSlots } from './kuehlplatzSlots';

const cfg: EigenerKuehlraumConfig = {
  id: 'grafenbach',
  label: 'Grafenbach',
  matchKeywords: ['grafenbach'],
  plaetze: 4,
};

describe('belegeKuehlraumSlots', () => {
  beforeEach(() => {
    setDispositionSettings(DEFAULT_DISPOSITION_SETTINGS);
  });

  it('nutzt manuelle Disposition-Plätze', () => {
    const faelle: Sterbefall[] = [
      {
        id: 'a',
        aktivInAlamida: true,
        kuehlplatzDisposition: '3',
        kuehlraumIdDisposition: 'grafenbach',
        kuehlplatz: '1',
        kuehlraumId: 'Kühlr. Grafenbach',
        status: 'im_kuehlraum',
        ausstehend: [
          {
            vonOrt: 'UK',
            nachOrt: 'Kühl. Grafenbach',
            terminAm: '01.01.2020',
          },
        ],
      },
      {
        id: 'b',
        aktivInAlamida: true,
        kuehlplatz: '1',
        kuehlraumId: 'Kühlr. Grafenbach',
        status: 'im_kuehlraum',
        ausstehend: [
          {
            vonOrt: 'UK',
            nachOrt: 'Kühl. Grafenbach',
            terminAm: '01.01.2020',
          },
        ],
      },
    ];
    const slots = belegeKuehlraumSlots(faelle, cfg);
    expect(slots[2]?.id).toBe('a');
    expect(slots[0]?.id).toBe('b');
  });
});
