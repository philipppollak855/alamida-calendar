import type { Sterbefall } from '../types';
import { istManuellAusgeschlossen } from './fallAbschluss';
import { extractDeDatum } from './dateUtils';

function hatGueltigesDatum(raw?: string): boolean {
  return !!raw?.trim() && /\d{1,2}\.\d{1,2}\.\d{4}/.test(raw.trim());
}

export function istImAnschluss(raw?: boolean | string): boolean {
  if (raw === true) return true;
  if (!raw) return false;
  const t = String(raw).trim().toLowerCase();
  return (
    t === '1' ||
    t === 'ja' ||
    t === 'yes' ||
    t === 'true' ||
    t === 'x' ||
    t.includes('im anschluss') ||
    t.includes('im anschluß')
  );
}

/** Checkbox oder Beisetzungszeit „Im Anschluss“ (Alamida). */
export function sterbefallImAnschluss(s: Sterbefall): boolean {
  return istImAnschluss(s.imAnschluss) || istImAnschluss(s.beisetzungszeit);
}

export function hatFeierterminInDaten(s: Sterbefall): boolean {
  return Boolean(
    extractDeDatum(s.trauerfeierdatum) ||
      extractDeDatum(s.trauerfeier2datum) ||
      extractDeDatum(s.beisetzungsdatum) ||
      extractDeDatum(s.rosenkranzdatum)
  );
}

/** Kalender: auch archivierte Fälle mit Feierterminen (Wall-Tabs nutzen weiter filterAktive). */
export function filterSterbefaelleFuerKalender(sterbefaelle: Sterbefall[]): Sterbefall[] {
  return sterbefaelle.filter((s) => {
    if (istManuellAusgeschlossen(s.historieGrund)) return false;
    if (!istInHistory(s)) return true;
    return hatFeierterminInDaten(s);
  });
}

function parseDatumZeitDe(datum?: string, zeit?: string, endOfDayIfNoTime = false): number | null {
  if (!hatGueltigesDatum(datum)) return null;
  const m = datum!.trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;

  let h = endOfDayIfNoTime ? 23 : 0;
  let min = endOfDayIfNoTime ? 59 : 0;
  let sec = endOfDayIfNoTime ? 59 : 0;
  let ms = endOfDayIfNoTime ? 999 : 0;

  if (zeit?.trim()) {
    const tm = zeit.trim().match(/(\d{1,2})[.:](\d{2})/);
    if (tm) {
      h = +tm[1];
      min = +tm[2];
      sec = 0;
      ms = 0;
    }
  }

  return new Date(+m[3], +m[2] - 1, +m[1], h, min, sec, ms).getTime();
}

/** Beisetzung/Trauerfeier abgelaufen (gleiche Regeln wie Agent). */
export function istNachBeisetzungOderTrauerfeierAbgelaufen(s: Sterbefall): boolean {
  const jetzt = Date.now();

  if (s.sichtbarBis?.seconds && jetzt >= s.sichtbarBis.seconds * 1000) {
    return true;
  }

  if (sterbefallImAnschluss(s) && hatGueltigesDatum(s.trauerfeierdatum)) {
    const trauerfeier = parseDatumZeitDe(s.trauerfeierdatum, s.trauerfeierzeit);
    if (trauerfeier != null && jetzt >= trauerfeier + 2 * 60 * 60 * 1000) return true;
  }

  if (hatGueltigesDatum(s.beisetzungsdatum)) {
    const hatUhrzeit = !!s.beisetzungszeit?.trim() && /\d{1,2}[.:]\d{2}/.test(s.beisetzungszeit);
    const beisetzung = parseDatumZeitDe(s.beisetzungsdatum, s.beisetzungszeit, false);
    if (beisetzung == null) return false;
    const m = s.beisetzungsdatum!.trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    const sichtbarBis = hatUhrzeit
      ? beisetzung + 2 * 60 * 60 * 1000
      : m
        ? new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59, 999).getTime()
        : beisetzung;
    if (jetzt >= sichtbarBis) return true;
  }

  return false;
}

/**
 * Fall aus Disposition/Wall ausblenden (Agent-Flag oder abgelaufene Beisetzung/Trauerfeier).
 */
export function istInHistory(s: Sterbefall): boolean {
  if (s.inHistory === true) return true;
  if (s.aktivInDisposition === false) return true;
  return istNachBeisetzungOderTrauerfeierAbgelaufen(s);
}

export function filterAktiveSterbefaelle(sterbefaelle: Sterbefall[]): Sterbefall[] {
  return sterbefaelle.filter((s) => !istInHistory(s));
}
