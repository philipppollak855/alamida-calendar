import { ALLE, type Konfiguration, type Rechte } from './rechte';

/** Personalplanung: wer bei einem Termin eingeteilt ist (ein Blob je Termin, Schlüssel „kalenderId/eventId“,
 * bzw. je Fall und Tag „fall:<Fall>|<YYYY-MM-DD>“ für den ganzen Ablauf). */
export interface EinteilungPerson {
  email: string;
  name?: string;
  extern?: boolean;
}

export interface Einteilung {
  termin: string;
  personen: EinteilungPerson[];
  geaendert: number;
  von: string;
}

const GESPRAECHE = new Set(['Trauergespraech', 'Vorsorge']);

/** Gespräche: eine Person; Überführungen, Begräbnisse und alle anderen Termine: höchstens 5. */
export const maxPersonen = (kategorie: string) => (GESPRAECHE.has(kategorie) ? 1 : 5);

/** Befähigt zur Personalplanung: Admins und die unter „Rechte“ → „Personalplanung“ gewählten Gruppen. */
export function darfEinteilen(r: Rechte, k: Konfiguration): boolean {
  if (r.admin) return true;
  const g = k.personalGruppen ?? [];
  return r.freigeschaltet && (g.includes(ALLE) || r.gruppen.some((x) => g.includes(x)));
}

export function einteilungFehler(kategorie: string, emails: string[], bekannt: Set<string>): string | null {
  if (new Set(emails).size !== emails.length) return 'Eine Person ist doppelt eingeteilt';
  const max = maxPersonen(kategorie);
  if (emails.length > max) return max === 1 ? 'Für ein Gespräch ist eine Person vorgesehen' : `Höchstens ${max} Personen je Termin`;
  const fremd = emails.find((e) => !bekannt.has(e));
  return fremd ? `Unbekannter Mitarbeiter: ${fremd}` : null;
}

/** „kalenderId/eventId“ zerlegen (Kalender-IDs enthalten kein „/“). */
export function terminTeile(id: string): { kalenderId: string; eventId: string } | null {
  const i = id.lastIndexOf('/');
  return i > 0 && i < id.length - 1 ? { kalenderId: id.slice(0, i), eventId: id.slice(i + 1) } : null;
}

/** Tag (Wiener Zeit) eines Zeitpunkts, „YYYY-MM-DD“. */
export const tagWien = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(d);

/** Personal für den Ablauf eines Falls an einem Tag (gilt für alle Untertermine, sofern nicht abweichend eingeteilt). */
export const ablaufId = (fall: string, tag: string) => `fall:${fall}|${tag}`;

/** Gespräche und ganztägige Termine gehören nicht zum Ablauf. */
export const ablaufGeeignetKat = (kategorie: string, ganztaegig: boolean) => !ganztaegig && !GESPRAECHE.has(kategorie);

/** Wirksames Personal: eigene (abweichende) Einteilung des Termins, sonst das Personal des Ablaufs an diesem Tag. */
export function wirksamesPersonal(
  t: { id: string; kategorie: string; ganztaegig: boolean; start: Date },
  fall: string | null | undefined,
  m: Map<string, EinteilungPerson[]>,
): { personal?: EinteilungPerson[]; quelle?: 'termin' | 'fall'; ablauf?: EinteilungPerson[] } {
  const ablauf = fall && ablaufGeeignetKat(t.kategorie, t.ganztaegig) ? m.get(ablaufId(fall, tagWien(t.start))) : undefined;
  const eigen = m.get(t.id);
  return { personal: eigen ?? ablauf, quelle: eigen ? 'termin' : ablauf ? 'fall' : undefined, ablauf };
}

export const personName = (p: EinteilungPerson) => p.name || p.email.split('@')[0];
