export type KuehlraumWandTab = 'kuehlraum' | 'extern';

export interface EigenerKuehlraumConfig {
  id: string;
  label: string;
  /** Anzeige in Alamida, z. B. „Kühlr. Grafenbach“ */
  alamidaName?: string;
  /** Erkennung in Ortsnamen (Kleinbuchstaben, enthält) */
  matchKeywords: string[];
  /** Externe Abholorte (UK, Senecura …) → Zuordnung zu diesem Kühlraum */
  externKeywords: string[];
  /** Wandmonitor: Tab „Kühlraum“ (Platzraster) oder „Extern“ (Kartenliste) */
  wandTab?: KuehlraumWandTab;
  plaetze: number;
}

/** Anzeigedauer je Wandmonitor-Tab vor dem automatischen Wechsel (Sekunden). */
export interface WallTabWechselSekunden {
  kuehlraum: number;
  extern: number;
  kalender: number;
  abholungen: number;
  offen: number;
}

/** Aktiviert Tabs für den automatischen Rotationslauf am Wandmonitor. */
export interface WallTabRotationEnabled {
  kuehlraum: boolean;
  extern: boolean;
  kalender: boolean;
  abholungen: boolean;
  offen: boolean;
}

export interface DispositionSettings {
  kremationPrefixe: string[];
  kremationKeywords: string[];
  krankenhausPrefixe: string[];
  krankenhausKeywords: string[];
  /** Extern-Wand: Pflegeheim / Senecura … */
  pflegeheimPrefixe: string[];
  pflegeheimKeywords: string[];
  /** Extern-Wand: Bestattung / Bestatter … */
  bestattungPrefixe: string[];
  bestattungKeywords: string[];
  eigeneKuehlraeume: EigenerKuehlraumConfig[];
  /** Wandmonitor: Sekunden pro Tab bis zum nächsten Übergang */
  wallTabWechselSekunden?: WallTabWechselSekunden;
  /** Wandmonitor: welche Tabs in der Rotation angezeigt werden */
  wallTabRotationEnabled?: WallTabRotationEnabled;
  updatedAt?: { seconds: number };
  /** Änderungszähler für Agent-Reload */
  settingsVersion?: number;
}
