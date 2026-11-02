import type { DispositionSettings } from '../types/dispositionSettings';

export const DEFAULT_DISPOSITION_SETTINGS: DispositionSettings = {
  kremationPrefixe: [],
  kremationKeywords: [
    'krematorium',
    'innermanzing',
    'feba',
    'kremation',
    'einäscherung',
    'einaescherung',
    'feuerbestattung',
    'einäscherungsanlage',
  ],
  krankenhausPrefixe: ['UK ', 'UK-', 'KH ', 'KH-', 'KH.'],
  krankenhausKeywords: ['krankenhaus', 'spital', 'klinik', 'landesklinik'],
  pflegeheimPrefixe: ['Senecura'],
  pflegeheimKeywords: ['senecura', 'pflegeheim', 'altenheim', 'hospiz', 'pflege'],
  bestattungPrefixe: [],
  bestattungKeywords: ['bestattung', 'bestatter', 'trauerhalle', 'bestattungsinstitut'],
  wallTabWechselSekunden: {
    kuehlraum: 18,
    extern: 18,
    kalender: 24,
    abholungen: 18,
    offen: 18,
  },
  wallTabRotationEnabled: {
    kuehlraum: true,
    extern: true,
    kalender: true,
    abholungen: true,
    offen: true,
  },
  eigeneKuehlraeume: [
    {
      id: 'grafenbach',
      label: 'Firmenkühlraum Grafenbach',
      alamidaName: 'Kühlr. Grafenbach',
      matchKeywords: [
        'grafenbach',
        'kühlr. grafenbach',
        'kuehlr. grafenbach',
        'kühl. grafenbach',
        'kuehl. grafenbach',
      ],
      externKeywords: [],
      wandTab: 'kuehlraum',
      plaetze: 9,
    },
  ],
};
