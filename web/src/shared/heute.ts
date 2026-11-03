import type { Abwesenheit } from './abwesenheit';
import { ARTEN } from './abwesenheit';
import type { Einsatz } from './bereitschaft';
import { personName, wirksamesPersonal, type EinteilungPerson } from './einteilung';

/** Tagesübersicht für das Dashboard im Bestattung Stranz HUB (/api/heute). */
export interface HeuteEintrag {
  art: 'termin' | 'bereitschaft' | 'abwesenheit';
  id: string;
  titel: string;
  /** JJJJ-MM-TTTHH:mm (Ortszeit Wien) bzw. JJJJ-MM-TT bei ganztägig */
  von?: string;
  bis?: string;
  ganztaegig?: boolean;
  ort?: string;
  kategorie?: string;
  symbol?: string;
  /** Betrifft die angemeldete Person selbst. */
  meins: boolean;
  /** Absolute Adresse in der App (Klick im Hub). */
  ziel: string;
  /** Termine desselben Sterbefalls haben denselben Schlüssel (Sterbefallnummer bzw. Name). */
  fall?: string;
  verstorbener?: string;
}

export interface HeuteHinweis {
  text: string;
  ziel: string;
}

export const ZEITZONE = 'Europe/Vienna';

/** JJJJ-MM-TTTHH:mm in Wiener Ortszeit. */
export function ortszeit(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: ZEITZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(d)
    .replace(' ', 'T');
}

export const heuteText = (jetzt = new Date()) => ortszeit(jetzt).slice(0, 10);

interface Ereignis {
  id: string;
  summary?: string;
  location?: string;
  status?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { email?: string }[];
  description?: string;
  extendedProperties?: { private?: Record<string, string> };
}

/** Sterbefall aus den Agent-Daten bzw. der Beschreibung („Sterbefall: 260251 | Name“). */
export function sterbefallAus(ev: Pick<Ereignis, 'description' | 'extendedProperties'>): { sterbefallId?: string; verstorbener?: string } {
  const p = ev.extendedProperties?.private ?? {};
  const m = /Sterbefall:\s*([^|\n]+?)\s*(?:\|\s*([^\n]+))?$/m.exec(ev.description ?? '');
  return { sterbefallId: p.sterbefallId || m?.[1]?.trim() || undefined, verstorbener: p.verstorbener || m?.[2]?.trim() || undefined };
}

/** Termine, die heute (Wiener Zeit) stattfinden – auch ganztägige und über Mitternacht laufende. */
export function termineHeute(
  events: { kalenderId: string; event: Ereignis; kategorie: string }[],
  heute: string,
  ich: string,
  origin: string,
  eingeteilt: Map<string, EinteilungPerson[]> = new Map(),
): HeuteEintrag[] {
  const l: HeuteEintrag[] = [];
  for (const { kalenderId, event: e, kategorie } of events) {
    if (e.status === 'cancelled') continue;
    let von: string, bis: string, ganztaegig: boolean;
    if (e.start?.dateTime && e.end?.dateTime) {
      von = ortszeit(new Date(e.start.dateTime));
      bis = ortszeit(new Date(e.end.dateTime));
      ganztaegig = false;
      if (!(von < `${heute}T24:00` && (bis > `${heute}T00:00` || von.startsWith(heute)))) continue;
    } else if (e.start?.date) {
      von = e.start.date;
      bis = e.end?.date ?? e.start.date;
      ganztaegig = true;
      if (!(von <= heute && (bis > heute || von === heute))) continue;
    } else continue;
    const id = `${kalenderId}/${e.id}`;
    const sf = sterbefallAus(e);
    const fall = sf.sterbefallId ?? (sf.verstorbener ? `name:${sf.verstorbener.toLowerCase()}` : undefined);
    const start = new Date(e.start.dateTime ?? `${von}T12:00:00`);
    const personal = wirksamesPersonal({ id, kategorie, ganztaegig, start }, fall, eingeteilt).personal ?? [];
    const ort = [e.location, personal.length ? `👥 ${personal.map(personName).join(', ')}` : ''].filter(Boolean).join(' · ');
    l.push({
      art: 'termin',
      id,
      titel: e.summary?.trim() || '(ohne Titel)',
      von,
      bis,
      ganztaegig,
      ...(ort ? { ort } : {}),
      kategorie,
      meins: personal.some((p) => p.email === ich) || !!e.attendees?.some((a) => a.email?.toLowerCase() === ich),
      ziel: `${origin}/?tag=${heute}&termin=${encodeURIComponent(id)}`,
      ...(fall ? { fall } : {}),
      ...(sf.verstorbener ? { verstorbener: sf.verstorbener } : {}),
    });
  }
  return l.sort((a, b) => (a.ganztaegig === b.ganztaegig ? (a.von ?? '').localeCompare(b.von ?? '') : a.ganztaegig ? -1 : 1));
}

const bisZeit = (s: string) => (s.length === 10 ? `${s}T24:00` : s);

export function bereitschaftHeute(einsaetze: Einsatz[], heute: string, ich: string, origin: string, namen: Map<string, string>): HeuteEintrag[] {
  return einsaetze
    .filter((e) => e.von < `${heute}T24:00` && bisZeit(e.bis) > `${heute}T00:00`)
    .sort((a, b) => a.von.localeCompare(b.von))
    .map((e) => ({
      art: 'bereitschaft' as const,
      id: e.id,
      titel: e.name || namen.get(e.email) || e.email,
      von: e.von,
      bis: e.bis,
      symbol: '🛡️',
      meins: e.email === ich,
      ziel: `${origin}/bereitschaft`,
    }));
}

/** Wer heute fehlt. Ohne Verwaltungsrecht werden fremde Einträge nur als „abwesend“ gezeigt (ohne Art). */
export function abwesendHeute(
  liste: Abwesenheit[],
  heute: string,
  ich: string,
  verwalter: boolean,
  origin: string,
  namen: Map<string, string>,
): HeuteEintrag[] {
  return liste
    .filter((a) => a.von <= heute && a.bis >= heute)
    .filter((a) => a.status === 'genehmigt' || a.status === 'gemeldet' || (a.email === ich && a.status === 'beantragt'))
    .map((a) => {
      const offen = verwalter || a.email === ich;
      const name = namen.get(a.email) || a.name || a.email;
      const art = ARTEN[a.art];
      return {
        art: 'abwesenheit' as const,
        id: a.id,
        titel: offen ? `${name} – ${art.label}${a.status === 'beantragt' ? ' (beantragt)' : ''}` : `${name} – abwesend`,
        von: a.von,
        bis: a.bis,
        ganztaegig: !a.stunden,
        symbol: offen ? art.symbol : '🚫',
        meins: a.email === ich,
        ziel: `${origin}/abwesenheit`,
      };
    });
}
