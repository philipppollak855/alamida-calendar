/** Telefonbereitschaft: genau eine Person gleichzeitig (Rolle Telefon). Wiederkehrende Muster plus freie Einträge, die das Muster überschreiben. */
import { ausText, datumText, gueltigeZeit, plusTage, ueberschneidet, zeitText } from './bereitschaft';
import { hatRolle, rolleVergeben, type MitRollen } from './rollen';

export interface TelEinsatz {
  id: string;
  email: string;
  name?: string;
  /** JJJJ-MM-TTTHH:mm (Ortszeit) */
  von: string;
  bis: string;
  eingetragenVon?: string;
  erstellt?: number;
}

export interface TelMuster {
  id: string;
  email: string;
  name?: string;
  /** Wochentage, 0 = Sonntag … 6 = Samstag (Beginn des Dienstes). */
  tage: number[];
  /** HH:mm; ist `bis` ≤ `von`, endet der Dienst am Folgetag (gleich = 24 Stunden). */
  von: string;
  bis: string;
  /** Jede n-te Woche, gezählt ab der Woche von `ab`. */
  intervall: number;
  ab: string;
  ende?: string;
}

export interface TelSegment {
  id: string;
  email: string;
  name?: string;
  von: string;
  bis: string;
  quelle: 'eintrag' | 'muster';
  musterId?: string;
}

export const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const MAX_EINTRAG_TAGE = 31;
const UHR = /^([01]\d|2[0-3]):[0-5]\d$/;
const gueltigesDatum = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && datumText(ausText(s)) === s;
const montag = (d: Date) => plusTage(d, -((d.getDay() + 6) % 7));
const wochenAbstand = (a: Date, b: Date) => Math.round((montag(a).getTime() - montag(b).getTime()) / (7 * 86_400_000));

/** Alle Dienste eines Musters, die zwischen `ab` und `bis` (Tage, inkl. Vortag wegen Nachtdiensten) beginnen. */
export function musterSegmente(m: TelMuster, ab: Date, bis: Date): TelSegment[] {
  const out: TelSegment[] = [];
  const start = ausText(m.ab);
  for (let t = plusTage(new Date(ab.getFullYear(), ab.getMonth(), ab.getDate()), -1); t <= bis; t = plusTage(t, 1)) {
    const tag = datumText(t);
    if (tag < m.ab || (m.ende && tag > m.ende) || !m.tage.includes(t.getDay())) continue;
    if (wochenAbstand(t, start) % m.intervall !== 0) continue;
    out.push({
      id: `m:${m.id}:${tag}`,
      email: m.email,
      ...(m.name ? { name: m.name } : {}),
      von: `${tag}T${m.von}`,
      bis: `${m.bis <= m.von ? datumText(plusTage(t, 1)) : tag}T${m.bis}`,
      quelle: 'muster',
      musterId: m.id,
    });
  }
  return out;
}

function abziehen(s: TelSegment, e: { von: string; bis: string }): TelSegment[] {
  if (!ueberschneidet(s, e)) return [s];
  const teile: TelSegment[] = [];
  if (s.von < e.von) teile.push({ ...s, bis: e.von });
  if (e.bis < s.bis) teile.push({ ...s, von: e.bis, id: `${s.id}+${e.bis}` });
  return teile;
}

/** Tatsächliche Besetzung im Zeitraum [ab, bis): Einträge gehen vor, Muster füllen den Rest. */
export function belegung(eintraege: TelEinsatz[], muster: TelMuster[], ab: Date, bis: Date): TelSegment[] {
  const z = { von: zeitText(ab), bis: zeitText(bis) };
  const eigene: TelSegment[] = eintraege
    .filter((e) => ueberschneidet(e, z))
    .map((e) => ({ id: e.id, email: e.email, ...(e.name ? { name: e.name } : {}), von: e.von, bis: e.bis, quelle: 'eintrag' }));
  let ms = muster.flatMap((m) => musterSegmente(m, ab, bis)).filter((s) => ueberschneidet(s, z));
  for (const e of eigene) ms = ms.flatMap((s) => abziehen(s, e));
  return [...eigene, ...ms].sort((a, b) => a.von.localeCompare(b.von) || a.bis.localeCompare(b.bis));
}

/** Wer hat zum Zeitpunkt `jetzt` (JJJJ-MM-TTTHH:mm) Telefondienst? */
export function telefonJetzt(eintraege: TelEinsatz[], muster: TelMuster[], jetzt: string): TelSegment | null {
  const tag = ausText(jetzt.slice(0, 10));
  return belegung(eintraege, muster, plusTage(tag, -1), plusTage(tag, 2)).find((s) => s.von <= jetzt && jetzt < s.bis) ?? null;
}

/** Abschnitte eines Tages [00:00, 24:00): belegt oder frei. */
export function tagesAbschnitte(segmente: TelSegment[], tag: string): { von: string; bis: string; s?: TelSegment }[] {
  const start = `${tag}T00:00`;
  const ende = `${datumText(plusTage(ausText(tag), 1))}T00:00`;
  const uhr = (z: string) => (z <= start ? '00:00' : z >= ende ? '24:00' : z.slice(11, 16));
  const out: { von: string; bis: string; s?: TelSegment }[] = [];
  let pos = '00:00';
  for (const s of segmente.filter((x) => ueberschneidet(x, { von: start, bis: ende }))) {
    const v = uhr(s.von);
    if (v > pos) out.push({ von: pos, bis: v });
    out.push({ von: v, bis: uhr(s.bis), s });
    if (uhr(s.bis) > pos) pos = uhr(s.bis);
  }
  if (pos < '24:00') out.push({ von: pos, bis: '24:00' });
  return out;
}

const rollenFehler = (email: string, personen?: MitRollen[]) =>
  personen && rolleVergeben(personen, 'telefon') && !hatRolle(personen.find((p) => p.email === email), 'telefon')
    ? 'Nur Mitarbeiter mit der Rolle „Telefon“ können eingeteilt werden'
    : null;

/** Prüft einen freien Eintrag: gültiger Zeitraum, höchstens 31 Tage, keine Überschneidung mit anderen Einträgen. */
export function telEintragFehler(eintraege: TelEinsatz[], neu: { email: string; von: string; bis: string }, personen?: MitRollen[]): string | null {
  const r = rollenFehler(neu.email, personen);
  if (r) return r;
  if (!gueltigeZeit(neu.von) || !gueltigeZeit(neu.bis) || neu.von >= neu.bis) return 'Ungültiger Zeitraum';
  if (ausText(neu.bis).getTime() - ausText(neu.von).getTime() > MAX_EINTRAG_TAGE * 86_400_000) return `Höchstens ${MAX_EINTRAG_TAGE} Tage am Stück`;
  const k = eintraege.find((e) => ueberschneidet(e, neu));
  if (k) return `Zu dieser Zeit ist schon ${k.name || k.email} eingetragen`;
  return null;
}

/** Bereinigt ein Muster aus der Anfrage und prüft es gegen die übrigen Muster (keine zwei Personen gleichzeitig). */
export function musterAus(x: unknown, id: string, andere: TelMuster[], personen?: MitRollen[]): { muster?: TelMuster; fehler: string | null } {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : '';
  if (!email) return { fehler: 'Bitte eine Person wählen' };
  const r = rollenFehler(email, personen);
  if (r) return { fehler: r };
  const tage = [...new Set(Array.isArray(o.tage) ? o.tage.filter((t): t is number => Number.isInteger(t) && t >= 0 && t <= 6) : [])].sort();
  if (!tage.length) return { fehler: 'Bitte mindestens einen Wochentag wählen' };
  if (typeof o.von !== 'string' || !UHR.test(o.von) || typeof o.bis !== 'string' || !UHR.test(o.bis)) return { fehler: 'Bitte Beginn und Ende als Uhrzeit angeben' };
  const intervall = Number(o.intervall ?? 1);
  if (!Number.isInteger(intervall) || intervall < 1 || intervall > 4) return { fehler: 'Ungültiger Rhythmus' };
  if (!gueltigesDatum(o.ab)) return { fehler: 'Bitte ein gültiges Startdatum angeben' };
  if (o.ende !== undefined && o.ende !== '' && (!gueltigesDatum(o.ende) || o.ende < o.ab)) return { fehler: 'Das Enddatum liegt vor dem Start' };
  const muster: TelMuster = { id, email, tage, von: o.von, bis: o.bis, intervall, ab: o.ab, ...(gueltigesDatum(o.ende) ? { ende: o.ende } : {}) };
  for (const m of andere) {
    const ab = ausText(m.ab > muster.ab ? m.ab : muster.ab);
    const bis = plusTage(ab, 7 * 12);
    const a = musterSegmente(muster, ab, bis);
    const b = musterSegmente(m, ab, bis);
    if (a.some((s) => b.some((t) => ueberschneidet(s, t)))) return { fehler: `Überschneidet sich mit dem Muster von ${m.name || m.email}` };
  }
  return { muster, fehler: null };
}

export const musterText = (m: TelMuster) =>
  `${[1, 2, 3, 4, 5, 6, 0].filter((t) => m.tage.includes(t)).map((t) => WOCHENTAGE[t]).join(' ')} · ${m.von}–${m.bis}${m.bis <= m.von ? ' (+1)' : ''} · ${m.intervall === 1 ? 'jede Woche' : `jede ${m.intervall}. Woche`}`;
