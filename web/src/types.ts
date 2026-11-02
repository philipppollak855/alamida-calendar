export interface VerlaufEintrag {
  nummer?: number;
  typ?: string;
  ort?: string;
  vonOrt?: string;
  nachOrt?: string;
  terminAm?: string;
  abholungAm?: string;
  kuehlraum?: string;
}

export interface AusstehendEintrag {
  zeile?: number;
  schrittTyp?: string;
  vonOrt?: string;
  nachOrt?: string;
  terminAm?: string;
  abholungAm?: string;
  status?: string;
  istAbholungVomSterbeort?: boolean;
}

export interface Sterbefall {
  id: string;
  sterbefallId?: string;
  verstorbenerName?: string;
  verstorbenerVorname?: string;
  verstorbenerNachname?: string;
  sterbeort?: string;
  sterbedatum?: string;
  abholort?: string;
  abholortIstKrankenhaus?: boolean;
  quelleMaske?: string;
  erfassungsPhase?: string;
  istNeuerFall?: boolean;
  erfassungSchluessel?: string;
  bestattungsart?: string;
  endziel?: string;
  endzielTyp?: string;
  beisetzungsdatum?: string;
  beisetzungszeit?: string;
  trauerfeierdatum?: string;
  trauerfeierzeit?: string;
  trauerfeierort?: string;
  trauerfeier2datum?: string;
  trauerfeier2zeit?: string;
  trauerfeier2ort?: string;
  rosenkranzdatum?: string;
  rosenkranzzeit?: string;
  rosenkranzort?: string;
  /** Trauergespräch / Aufnahmetermin (Tab Termine). */
  aufnahmedatum?: string;
  aufnahmezeit?: string;
  aufnahmeort?: string;
  imAnschluss?: boolean;
  inHistory?: boolean;
  aktivInDisposition?: boolean;
  sichtbarBis?: { seconds: number };
  historieGrund?: string;
  /** Manueller Abschluss aus Disposition (maschinenlesbar, gleich historieGrund). */
  abschlussGrund?: string;
  abschlussBemerkung?: string;
  abgeschlossenAm?: { seconds: number };
  archiviertAm?: { seconds: number };
  aktuellePosition?: string;
  aktuellePositionTyp?: string;
  kuehlraumId?: string;
  kuehlplatz?: string;
  /** Manuelle Platz-Zuordnung aus Disposition (Drag & Drop). */
  kuehlplatzDisposition?: string;
  kuehlraumIdDisposition?: string;
  status?: string;
  naechsterSchrittAm?: string;
  naechsterSchrittVon?: string;
  naechsterSchrittNach?: string;
  naechsterSchrittTyp?: string;
  naechsteUeberfuehrungAm?: string;
  naechsteUeberfuehrungVon?: string;
  naechsteUeberfuehrungNach?: string;
  verlauf?: VerlaufEintrag[];
  ausstehend?: AusstehendEintrag[];
  workstationId?: string;
  aktivInAlamida?: boolean;
  /** Wandmonitor: Retour aus Extern/Kremation → Bereich Urnen unter Kühlraum */
  urnenBereich?: boolean;
  urnenSeit?: { seconds: number };
  retourVon?: string;
  /** Wandmonitor Extern: Freigabe erfasst */
  freigabeFrei?: boolean;
  freigabeDatum?: string;
  freigabeAm?: { seconds: number };
  /** Wand/Disposition: erledigte Zeilen aus ausstehend (Zeilennummer). */
  erledigteUeberfuehrungenZeilen?: number[];
  lastSeenAt?: { seconds: number };
  updatedAt?: { seconds: number };
}

export interface Ueberfuehrung {
  id: string;
  sterbefallId?: string;
  zeile?: number;
  schrittTyp?: string;
  vonOrt?: string;
  nachOrt?: string;
  terminAm?: string;
  abholungAm?: string;
  kuehlraumId?: string;
  aktuellerStandort?: string;
  workstationId?: string;
}

export interface MonitoringEvent {
  id: string;
  type?: string;
  sterbefallId?: string;
  kuehlraumId?: string;
  aktuellePosition?: string;
  workstationId?: string;
  createdAt?: { seconds: number };
}

export interface OffeneUeberfuehrungRow {
  docId: string;
  zeile: number;
  erledigt?: boolean;
  sterbefallId: string;
  name: string;
  schrittTyp: string;
  vonOrt: string;
  nachOrt: string;
  terminAm: string;
  status: string;
  endziel?: string;
  endzielTyp?: string;
  istAbholungVomSterbeort?: boolean;
  abholortIstKrankenhaus?: boolean;
}

export function schrittTypLabel(typ?: string): string {
  switch (typ) {
    case 'abholung':
      return 'Abholung';
    case 'kremation':
      return 'Kremation';
    case 'ueberfuehrung':
      return 'Überführung';
    case 'sterbeort':
      return 'Sterbeort';
    default:
      return typ ?? '—';
  }
}
