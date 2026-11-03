export type Kategorie =
  | 'Beisetzung'
  | 'Trauerfeier'
  | 'Rosenkranz'
  | 'Trauergespraech'
  | 'Abholung'
  | 'Ueberfuehrung'
  | 'Kremation'
  | 'Vorsorge'
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
  Vorsorge: { label: 'Vorsorge', symbol: '📝', farbe: '#33b679', gruppe: 'Gespräche' },
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
  /** Strukturierte Daten des Agents (extendedProperties.private): art, ort, route, von, nach, sterbedatum, ... */
  details: Record<string, string>;
  /** Eingeteiltes Personal (Personalplanung). */
  personal?: { email: string; name?: string }[];
}

export const personalText = (t: Termin) => (t.personal ?? []).map((p) => p.name || p.email.split('@')[0]).join(', ');

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
  [/vorsorge/i, 'Vorsorge'],
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
  const details = { ...(ev.extendedProperties?.private ?? {}) };
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
    sterbefallId: details.sterbefallId || fall?.[1]?.trim() || undefined,
    verstorbener: details.verstorbener || fall?.[2]?.trim() || undefined,
    beschreibung,
    link: ev.htmlLink,
    details,
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

/** Tagesliste: Termine desselben Sterbefalls (ab 2 Terminen) als ein Block, sonst Einzeltermine – in zeitlicher Reihenfolge. */
export type Block = { art: 'einzel'; termin: Termin } | { art: 'fall'; schluessel: string; name: string; sterbefallId?: string; termine: Termin[] };

export function bloecke(termine: Termin[]): Block[] {
  const liste = sortiert(termine);
  const schluessel = (t: Termin) => t.sterbefallId ?? (t.verstorbener ? `name:${t.verstorbener.toLowerCase()}` : null);
  const gruppen = new Map<string, Termin[]>();
  for (const t of liste) {
    const k = schluessel(t);
    if (k) gruppen.set(k, [...(gruppen.get(k) ?? []), t]);
  }
  const r: Block[] = [];
  const fertig = new Set<string>();
  for (const t of liste) {
    const k = schluessel(t);
    const g = k ? gruppen.get(k)! : [];
    if (!k || g.length < 2) r.push({ art: 'einzel', termin: t });
    else if (!fertig.has(k)) {
      fertig.add(k);
      r.push({ art: 'fall', schluessel: k, name: g.find((x) => x.verstorbener)?.verstorbener ?? t.sterbefallId ?? t.titel, sterbefallId: g[0].sterbefallId, termine: g });
    }
  }
  return r;
}

export const blockStart = (b: Block) => (b.art === 'einzel' ? b.termin : b.termine[0]);

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

export function suche(termine: Termin[], text: string): Termin[] {
  const woerter = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!woerter.length) return termine;
  return termine.filter((t) => {
    const heu = [t.titel, t.ort, t.verstorbener, t.sterbefallId, KATEGORIEN[t.kategorie].label, personalText(t), ...Object.values(t.details)]
      .join(' ')
      .toLowerCase();
    return woerter.every((w) => heu.includes(w));
  });
}

export function fallDaten(termine: Termin[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (const t of termine) for (const [k, v] of Object.entries(t.details)) if (v && !(k in r)) r[k] = v;
  return r;
}

export interface CheckPunkt {
  label: string;
  erledigt: boolean;
}

/** Was fuer einen Sterbefall typischerweise geplant sein muss. */
export function checkliste(termine: Termin[]): CheckPunkt[] {
  const hat = (k: Kategorie) => termine.some((t) => t.kategorie === k);
  const art = (fallDaten(termine).bestattungsart ?? '').toLowerCase();
  const feuer = /feuer|krem|urne/.test(art) || hat('Kremation');
  const punkte: CheckPunkt[] = [
    { label: 'Abholung', erledigt: hat('Abholung') },
    { label: 'Trauergespräch', erledigt: hat('Trauergespraech') },
    { label: 'Trauerfeier', erledigt: hat('Trauerfeier') },
  ];
  if (feuer) punkte.push({ label: 'Kremation', erledigt: hat('Kremation') });
  punkte.push({ label: feuer ? 'Urnenbeisetzung' : 'Beisetzung', erledigt: hat('Beisetzung') });
  return punkte;
}

export interface OrtBelegung {
  ort: string;
  termine: Termin[];
}

export function orte(termine: Termin[], ab: Date, tage = 14): OrtBelegung[] {
  const von = startDesTages(ab);
  const bis = plusTage(von, tage);
  const map = new Map<string, Termin[]>();
  for (const t of termine) {
    if (!t.ort || t.ende <= von || t.start >= bis) continue;
    map.set(t.ort, [...(map.get(t.ort) ?? []), t]);
  }
  return [...map.entries()]
    .map(([ort, ts]) => ({ ort, termine: ts.sort((a, b) => a.start.getTime() - b.start.getTime()) }))
    .sort((a, b) => b.termine.length - a.termine.length || a.ort.localeCompare(b.ort, 'de'));
}

export function mapsLink(t: Termin): string | null {
  const von = t.details.von;
  const nach = t.details.nach;
  if (von && nach) {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(von)}&destination=${encodeURIComponent(nach)}`;
  }
  const ziel = t.ort || nach || von;
  return ziel ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ziel)}` : null;
}

/** "läuft", "in 25 Min." oder null (nur heute, bis 3 Std. vorher). */
export function countdown(t: Termin, jetzt: Date): string | null {
  if (t.ganztaegig) return null;
  if (t.start <= jetzt && t.ende > jetzt) return 'läuft';
  const min = Math.round((t.start.getTime() - jetzt.getTime()) / 60000);
  if (min <= 0 || min > 180) return null;
  return min < 60 ? `in ${min} Min.` : `in ${Math.floor(min / 60)} Std. ${min % 60} Min.`;
}
