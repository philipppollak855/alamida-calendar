import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DispositionSettings } from '../types/dispositionSettings';
import {
  matchExternOrtZuKuehlraum,
  resolveFallKuehlraumId,
} from './kuehlraumZuordnung';
import { setDispositionSettings } from '../settings/dispositionSettingsStore';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import type { Sterbefall } from '../types';

const settings: DispositionSettings = {
  kremationPrefixe: [],
  kremationKeywords: [],
  krankenhausPrefixe: ['UK '],
  krankenhausKeywords: ['krankenhaus'],
  pflegeheimPrefixe: [],
  pflegeheimKeywords: ['senecura'],
  bestattungPrefixe: [],
  bestattungKeywords: [],
  eigeneKuehlraeume: [
    {
      id: 'gb',
      label: 'Grafenbach',
      matchKeywords: ['grafenbach'],
      externKeywords: ['neunkirchen', 'uk-neunkirchen'],
      plaetze: 9,
    },
    {
      id: 'wien',
      label: 'Wien',
      matchKeywords: ['wien'],
      externKeywords: ['wolfsberg', 'uk wolfsberg'],
      plaetze: 6,
    },
  ],
};

describe('matchExternOrtZuKuehlraum', () => {
  it('ordnet UK-Neunkirchen Grafenbach zu', () => {
    expect(matchExternOrtZuKuehlraum('UK-Neunkirchen', settings)?.id).toBe('gb');
  });

  it('ordnet Wolfsberg Wien zu', () => {
    expect(matchExternOrtZuKuehlraum('KH Wolfsberg', settings)?.id).toBe('wien');
  });
});

describe('resolveFallKuehlraumId', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 9, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ordnet im KR liegenden Fall per abgeschlossener Route zu (nicht aktuellePosition)', () => {
    setDispositionSettings(DEFAULT_DISPOSITION_SETTINGS);
    const fall = {
      id: 'k1',
      sterbefallId: '260200',
      aktivInAlamida: true,
      aktuellePosition: 'UK - Neunkirchen',
      ausstehend: [
        {
          zeile: 1,
          vonOrt: 'UK - Neunkirchen',
          nachOrt: 'Kühl. Grafenbach',
          terminAm: '05.06.2026',
          status: 'geplant',
        },
      ],
    } as Sterbefall;
    expect(resolveFallKuehlraumId(fall)).toBe('grafenbach');
  });

  it('nutzt externKeywords bei ausstehender Route', () => {
    const fall = {
      id: '1',
      sterbefallId: '1',
      ausstehend: [
        {
          vonOrt: 'UK-Neunkirchen',
          nachOrt: 'Kühlr. Wien',
          status: 'geplant',
        },
      ],
    } as Sterbefall;
    expect(resolveFallKuehlraumId(fall, settings)).toBe('gb');
  });
});
