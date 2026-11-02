export type Kategorie =
  | 'Beisetzung'
  | 'Trauerfeier'
  | 'Rosenkranz'
  | 'Trauergespraech'
  | 'Abholung'
  | 'Ueberfuehrung'
  | 'Kremation'
  | 'Sonstiges';

export type Gruppe = 'Zeremonien' | 'Fahrten' | 'Gespräche' | 'Sonstiges';

export const KATEGORIEN: Record<Kategorie, { label: string; symbol: string; farbe: string; gruppe: Gruppe }> = {
  Beisetzung: { label: 'Beisetzung', symbol: '⚰️', farbe: '#616161', gruppe: 'Zeremonien' },
  Trauerfeier: { label: 'Trauerfeier', symbol: '🕯️', farbe: '#8e24aa', gruppe: 'Zeremonien' },
  Rosenkranz: { label: 'Rosenkranz', symbol: '📿', farbe: '#7986cb', gruppe: 'Zeremonien' },
  Trauergespraech: { label: 'Trauergespräch', symbol: '💬', farbe: '#e4a700', gruppe: 'Gespräche' },
  Abholung: { label: 'Abholung', symbol: '🚐', farbe: '#d50000', gruppe: 'Fahrten' },
  Ueberfuehrung: { label: 'Überführung', symbol: '🚗', farbe: '#3f51b5', gruppe: 'Fahrten' },
  Kremation: { label: 'Kremation', symbol: '🔥', farbe: '#f4511e', gruppe: 'Fahrten' },
  Sonstiges: { label: 'Sonstiges', symbol: '📌', farbe: '#78909c', gruppe: 'Sonstiges' },
};

export const GRUPPEN: Gruppe[] = ['Zeremonien', 'Fahrten', 'Gespräche'];

export interface Termin {
  id: string;
  kalenderId: string;
  kalenderName: string;
  titel: string;
  start: Date;
  ende: Date;
  ganztaegig: boolean;
  ort: string;
  kategorie: Kategorie;
  sterbefallId?: string;
  verstorbener?: string;
  beschreibung: string;
  link?: string;
}

/** Ausschnitt aus der Google Calendar API (events.list). */
export interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}

const STICHWORTE: [RegExp, Kategorie][] = [
  [/beisetzung|begräbnis|bestattung/i, 'Beisetzung'],
  [/trauerfeier|verabschiedung|seelenmesse/i, 'Trauerfeier'],
  [/rosenkranz/i, 'Rosenkranz'],
  [/trauergespräch|aufnahme/i, 'Trauergespraech'],
  [/abholung/i, 'Abholung'],
  [/kremation|krematorium|feuerbestattung/i, 'Kremation'],
  [/überführung|ueberfuehrung/i, 'Ueberfuehrung'],
];

export function kategorieAus(ev: GoogleEvent): Kategorie {
  const k = ev.extendedProperties?.private?.kategorie;
  if (k && k in KATEGORIEN) return k as Kategorie;
  const text = `${ev.summary ?? ''}\n${ev.description ?? ''}`;
  for (const [re, kat] of STICHWORTE) if (re.test(ev.summary ?? '')) return kat;
  for (const [re, kat] of STICHWORTE) if (re.test(text)) return kat;
  return 'Sonstiges';
}

function parseDatum(d?: { date?: string; dateTime?: string }): { wert: Date; ganztaegig: boolean } | null {
  if (d?.dateTime) return { wert: new Date(d.dateTime), ganztaegig: false };
  if (d?.date) {
    const [y, m, t] = d.date.split('-').map(Number);
    return { wert: new Date(y, m - 1, t), ganztaegig: true };
  }
  return null;
}

export function ausGoogleEvent(ev: GoogleEvent, kalenderId: string, kalenderName: string): Termin | null {
  if (ev.status === 'cancelled') return null;
  const start = parseDatum(ev.start);
  if (!start) return null;
  const ende = parseDatum(ev.end)?.wert ?? new Date(start.wert.getTime() + 3600_000);
  const beschreibung = ev.description ?? '';
  const fall = /Sterbefall:\s*([^|\n]+?)\s*(?:\|\s*([^\n]+))?$/m.exec(beschreibung);
  return {
    id: `${kalenderId}/${ev.id}`,
    kalenderId,
    kalenderName,
    titel: ev.summary ?? '(ohne Titel)',
    start: start.wert,
    ende,
    ganztaegig: start.ganztaegig,
    ort: ev.location ?? '',
    kategorie: kategorieAus(ev),
    sterbefallId: ev.extendedProperties?.private?.sterbefallId || fall?.[1]?.trim() || undefined,
    verstorbener: fall?.[2]?.trim() || undefined,
    beschreibung,
    link: ev.htmlLink,
  };
}

export function startDesTages(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function plusTage(d: Date, tage: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + tage);
  return r;
}

function sortiert(termine: Termin[]): Termin[] {
  return [...termine].sort(
    (a, b) => Number(b.ganztaegig) - Number(a.ganztaegig) || a.start.getTime() - b.start.getTime(),
  );
}

export function termineAmTag(termine: Termin[], tag: Date): Termin[] {
  const von = startDesTages(tag);
  const bis = plusTage(von, 1);
  return sortiert(termine.filter((t) => t.start < bis && t.ende > von));
}

export function nachGruppe(termine: Termin[]): Record<Gruppe, Termin[]> {
  const r: Record<Gruppe, Termin[]> = { Zeremonien: [], Fahrten: [], 'Gespräche': [], Sonstiges: [] };
  for (const t of sortiert(termine)) r[KATEGORIEN[t.kategorie].gruppe].push(t);
  return r;
}

export interface Fall {
  sterbefallId: string;
  name: string;
  termine: Termin[];
  naechster?: Termin;
}

export function sterbefaelle(termine: Termin[], jetzt: Date): Fall[] {
  const map = new Map<string, Termin[]>();
  for (const t of termine) {
    if (!t.sterbefallId) continue;
    map.set(t.sterbefallId, [...(map.get(t.sterbefallId) ?? []), t]);
  }
  const heute = startDesTages(jetzt);
  return [...map.entries()]
    .map(([sterbefallId, ts]) => {
      const liste = [...ts].sort((a, b) => a.start.getTime() - b.start.getTime());
      return {
        sterbefallId,
        name: liste.find((t) => t.verstorbener)?.verstorbener ?? sterbefallId,
        termine: liste,
        naechster: liste.find((t) => t.ende > heute),
      };
    })
    .sort((a, b) => {
      if (a.naechster && b.naechster) return a.naechster.start.getTime() - b.naechster.start.getTime();
      if (a.naechster) return -1;
      if (b.naechster) return 1;
      return b.termine[b.termine.length - 1].start.getTime() - a.termine[a.termine.length - 1].start.getTime();
    });
}

export function fahrten(termine: Termin[], ab: Date, tage = 14): Termin[] {
  const von = startDesTages(ab);
  const bis = plusTage(von, tage);
  return termine
    .filter((t) => KATEGORIEN[t.kategorie].gruppe === 'Fahrten' && t.ende > von && t.start < bis)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export interface Warnung {
  art: 'ueberschneidung' | 'ohneUhrzeit' | 'reihenfolge';
  text: string;
  termine: Termin[];
}

const ZEREMONIEN: Kategorie[] = ['Beisetzung', 'Trauerfeier', 'Rosenkranz'];

function name(t: Termin): string {
  return t.verstorbener ?? t.sterbefallId ?? t.titel;
}

export function warnungen(termine: Termin[], jetzt: Date): Warnung[] {
  const heute = startDesTages(jetzt);
  const kommend = termine.filter((t) => t.ende > heute);
  const result: Warnung[] = [];

  const zeremonien = kommend
    .filter((t) => ZEREMONIEN.includes(t.kategorie) && !t.ganztaegig)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  for (let i = 0; i < zeremonien.length; i++) {
    for (let j = i + 1; j < zeremonien.length && zeremonien[j].start < zeremonien[i].ende; j++) {
      const [a, b] = [zeremonien[i], zeremonien[j]];
      if (a.sterbefallId && a.sterbefallId === b.sterbefallId) continue;
      result.push({
        art: 'ueberschneidung',
        text: `${KATEGORIEN[a.kategorie].label} ${name(a)} und ${KATEGORIEN[b.kategorie].label} ${name(b)} überschneiden sich`,
        termine: [a, b],
      });
    }
  }

  for (const t of kommend.filter((t) => ZEREMONIEN.includes(t.kategorie) && t.ganztaegig)) {
    result.push({ art: 'ohneUhrzeit', text: `${KATEGORIEN[t.kategorie].label} ${name(t)} hat keine Uhrzeit`, termine: [t] });
  }

  for (const fall of sterbefaelle(kommend, jetzt)) {
    const beisetzung = fall.termine.find((t) => t.kategorie === 'Beisetzung');
    if (!beisetzung) continue;
    for (const t of fall.termine) {
      const zuSpaet =
        (t.kategorie === 'Trauerfeier' || t.kategorie === 'Rosenkranz' || t.kategorie === 'Abholung') &&
        (beisetzung.ganztaegig || t.ganztaegig
          ? startDesTages(t.start) > startDesTages(beisetzung.start)
          : t.start > beisetzung.start);
      if (zuSpaet) {
        result.push({
          art: 'reihenfolge',
          text: `${name(t)}: ${KATEGORIEN[t.kategorie].label} liegt nach der Beisetzung`,
          termine: [t, beisetzung],
        });
      }
    }
  }

  return result;
}
