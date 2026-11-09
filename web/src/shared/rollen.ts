/** Mitarbeiter-Rollen (im Hub gepflegt) für die Personalauswahl. Eine Rolle filtert erst, wenn sie mindestens einer Person
 * zugewiesen ist – sonst stehen wie bisher alle zur Wahl. */

export type Rolle = 'arrangeur' | 'arrangeurIA' | 'traeger' | 'bereitschaft' | 'telefon' | 'berater';

export const ROLLEN: { id: Rolle; label: string }[] = [
  { id: 'arrangeur', label: 'Arrangeur' },
  { id: 'arrangeurIA', label: 'Arrangeur i.A.' },
  { id: 'traeger', label: 'Träger' },
  { id: 'bereitschaft', label: 'Bereitschaft' },
  { id: 'telefon', label: 'Telefon' },
  { id: 'berater', label: 'Berater' },
];
const IDS = new Set<string>(ROLLEN.map((r) => r.id));
export const rollenPruefen = (x: unknown): Rolle[] =>
  Array.isArray(x) ? [...new Set(x.filter((r): r is Rolle => typeof r === 'string' && IDS.has(r)))] : [];
export const rollenLabel = (r: Rolle) => ROLLEN.find((x) => x.id === r)?.label ?? r;

export type MitRollen = { email: string; rollen?: Rolle[] };
export const hatRolle = (p: MitRollen | undefined, ...r: Rolle[]) => !!p?.rollen?.some((x) => r.includes(x));
export const rolleVergeben = (personen: MitRollen[], ...r: Rolle[]) => personen.some((p) => hatRolle(p, ...r));

/** Nur Personen mit einer der Rollen – solange die Rollen noch niemandem zugewiesen sind, alle. */
export function mitRolle<T extends MitRollen>(personen: T[], ...r: Rolle[]): T[] {
  return rolleVergeben(personen, ...r) ? personen.filter((p) => hatRolle(p, ...r)) : personen;
}

/** Welche Besetzung eine Terminkategorie braucht. */
export type Bedarf = 'gespraech' | 'zeremonie' | 'fahrt' | 'sonstig';
export function bedarf(kategorie: string): Bedarf {
  if (kategorie === 'Trauergespraech' || kategorie === 'Vorsorge') return 'gespraech';
  if (kategorie === 'Beisetzung' || kategorie === 'Trauerfeier' || kategorie === 'Rosenkranz') return 'zeremonie';
  if (kategorie === 'Abholung' || kategorie === 'Ueberfuehrung' || kategorie === 'Kremation') return 'fahrt';
  return 'sonstig';
}

/** Auswählbare Personen je Bedarf (Zeremonie: Arrangeur, Arrangeur i.A. und Träger). */
export function auswahlFuer<T extends MitRollen>(b: Bedarf, personen: T[]): T[] {
  if (b === 'gespraech') return mitRolle(personen, 'berater');
  if (b === 'zeremonie' || b === 'fahrt') return mitRolle(personen, 'arrangeur', 'arrangeurIA', 'traeger');
  return personen;
}

/** Zeremonie: erste Person ist der Arrangeur. Ein Arrangeur i.A. darf zusätzlich als 6. Person mit. */
export function zeremonieMax(emails: string[], personen: MitRollen[]): number {
  const m = new Map(personen.map((p) => [p.email, p]));
  const iaZusaetzlich = emails.slice(1).some((e) => hatRolle(m.get(e), 'arrangeurIA') && !hatRolle(m.get(e), 'arrangeur', 'traeger'));
  return iaZusaetzlich ? 6 : 5;
}

/** Prüft die Zeremonie-Besetzung (nur wenn Rollen vergeben sind). `traegerBestaetigt`: ein Träger als Arrangeur ist ausdrücklich bestätigt. */
export function zeremonieFehler(emails: string[], personen: MitRollen[], traegerBestaetigt = false): string | null {
  if (!emails.length || !rolleVergeben(personen, 'arrangeur', 'arrangeurIA', 'traeger')) return null;
  const m = new Map(personen.map((p) => [p.email, p]));
  const erster = m.get(emails[0]);
  if (!hatRolle(erster, 'arrangeur', 'arrangeurIA') && !(traegerBestaetigt && hatRolle(erster, 'traeger')))
    return 'Es braucht einen Arrangeur (oder Arrangeur i.A.)';
  const fremd = emails.slice(1).find((e) => !hatRolle(m.get(e), 'traeger', 'arrangeurIA', 'arrangeur'));
  return fremd ? 'Das übrige Personal müssen Träger sein' : null;
}
