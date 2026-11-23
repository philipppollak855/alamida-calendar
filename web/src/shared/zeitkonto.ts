import { ARTEN, sollStunden, stundenJeTag, tageListe, zaehlt, type AbwArt, type Abwesenheit, type Personal } from './abwesenheit';

/** Monatsabschluss je Mitarbeiter (wie „Monat abschließen“ im alten Programm). kr/ur/so sind manuelle Korrekturen in Tagen zusätzlich zum Kalender. */
export interface MonatsEintrag {
  email: string;
  /** Berichtsmonat JJJJ-MM */
  monat: string;
  ue: number;
  ueAusb: number;
  kr: number;
  ur: number;
  so: number;
  geaendert?: number;
  von?: string;
}

export interface ZeitkontoEinstellungen {
  /** Überstunden kommen aus Berichtsmonat + verschiebungUe (alt: shift_ue). */
  verschiebungUe: number;
  /** Fehltage kommen aus Berichtsmonat + verschiebungAbw (alt: shift_abw). */
  verschiebungAbw: number;
}

export interface ZeitkontoDaten {
  eintraege: MonatsEintrag[];
  einstellungen: ZeitkontoEinstellungen;
  /** Nur in der Antwort: zwischengespeicherte, noch nicht abgeschlossene Werte. */
  entwuerfe?: MonatsEntwurf[];
  /** Nur in der Antwort: Briefpapier für den PDF-Bericht hinterlegt. */
  briefpapier?: boolean;
}

export type WertSchluessel = 'ue' | 'ueAusb' | 'kr' | 'ur' | 'so';
export const WERT_SCHLUESSEL: readonly WertSchluessel[] = ['ue', 'ueAusb', 'kr', 'ur', 'so'];

/** Zwischengespeicherte Eingaben eines Monats (wie angezeigt: Fehltage absolut), zählen nicht im Bericht. */
export interface MonatsEntwurf {
  email: string;
  monat: string;
  werte: Partial<Record<WertSchluessel, number>>;
  geaendert?: number;
  von?: string;
}

export const STANDARD_EINSTELLUNGEN: ZeitkontoEinstellungen = { verschiebungUe: 0, verschiebungAbw: 1 };
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
export const gueltigerMonat = (m: unknown): m is string => typeof m === 'string' && MONAT.test(m);

export function monatPlus(m: string, n: number): string {
  const [j, mo] = m.split('-').map(Number);
  const d = new Date(j, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const monatText = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
export const runden = (x: number) => Math.round(x * 100) / 100;

const zahl = (v: unknown, min: number, max: number) => (typeof v === 'number' && isFinite(v) ? Math.max(min, Math.min(max, runden(v))) : 0);
const verschiebung = (v: unknown, d: number) => (v === -1 || v === 0 || v === 1 ? v : d);

export function einstellungenPruefen(x: unknown): ZeitkontoEinstellungen {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  return {
    verschiebungUe: verschiebung(o.verschiebungUe, STANDARD_EINSTELLUNGEN.verschiebungUe),
    verschiebungAbw: verschiebung(o.verschiebungAbw, STANDARD_EINSTELLUNGEN.verschiebungAbw),
  };
}

export function eintragPruefen(x: unknown): MonatsEintrag | null {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase().slice(0, 200) : '';
  if (!email.includes('@') || !gueltigerMonat(o.monat)) return null;
  return {
    email,
    monat: o.monat,
    ue: zahl(o.ue, -1000, 1000),
    ueAusb: zahl(o.ueAusb, -1000, 1000),
    kr: zahl(o.kr, -31, 31),
    ur: zahl(o.ur, -31, 31),
    so: zahl(o.so, -31, 31),
    ...(typeof o.geaendert === 'number' ? { geaendert: o.geaendert } : {}),
    ...(typeof o.von === 'string' ? { von: o.von.slice(0, 200) } : {}),
  };
}

export function entwurfPruefen(x: unknown): MonatsEntwurf | null {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase().slice(0, 200) : '';
  if (!email.includes('@') || !gueltigerMonat(o.monat)) return null;
  const w = (o.werte && typeof o.werte === 'object' ? o.werte : {}) as Record<string, unknown>;
  const werte: MonatsEntwurf['werte'] = {};
  for (const k of WERT_SCHLUESSEL) if (typeof w[k] === 'number' && isFinite(w[k] as number)) werte[k] = zahl(w[k], k.startsWith('ue') ? -1000 : -31, k.startsWith('ue') ? 1000 : 62);
  return {
    email,
    monat: o.monat,
    werte,
    ...(typeof o.geaendert === 'number' ? { geaendert: o.geaendert } : {}),
    ...(typeof o.von === 'string' ? { von: o.von.slice(0, 200) } : {}),
  };
}

export function zeitkontoPruefen(x: unknown): ZeitkontoDaten {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const gesehen = new Set<string>();
  const eintraege = (Array.isArray(o.eintraege) ? o.eintraege : [])
    .map(eintragPruefen)
    .filter((e): e is MonatsEintrag => !!e && !gesehen.has(`${e.email}|${e.monat}`) && !!gesehen.add(`${e.email}|${e.monat}`));
  return { eintraege, einstellungen: einstellungenPruefen(o.einstellungen) };
}

export type KalenderTage = { kr: number; ur: number; so: number; za: number };

const SPALTE: Partial<Record<AbwArt, keyof KalenderTage>> = { krank: 'kr', urlaub: 'ur', pflege: 'so', sonderurlaub: 'so', za: 'za' };

/** Fehltage eines Kalendermonats aus Urlaub / Krank: Arbeitstage laut Wochenplan (ohne Wochenende/Feiertage), stundenweise anteilig. */
export function kalenderTage(p: Personal, abw: Abwesenheit[], monat: string): KalenderTage {
  const r: KalenderTage = { kr: 0, ur: 0, so: 0, za: 0 };
  const ab = `${monat}-01`;
  const bis = `${monat}-31`;
  const proTag = stundenJeTag(p) || 8;
  for (const a of abw) {
    const sp = SPALTE[a.art];
    if (!sp || a.email !== p.email || !zaehlt(a) || a.bis < ab || a.von > bis) continue;
    const tage = tageListe(a.von > ab ? a.von : ab, a.bis < bis ? a.bis : bis).filter((d) => sollStunden(p, d) > 0);
    if (a.stunden != null && a.von === a.bis) r[sp] += tage.length ? Math.min(1, a.stunden / proTag) : 0;
    else r[sp] += tage.length;
  }
  return { kr: runden(r.kr), ur: runden(r.ur), so: runden(r.so), za: runden(r.za) };
}

/** Ü-Übertrag zu Beginn des Monats: Start-Saldo + (neu − ausbezahlt) aller früheren Monate ab „Überstunden ab“. */
export function uebertrag(p: Personal, eintraege: MonatsEintrag[], monat: string): number {
  const ab = p.ueAbMonat ?? '0000-01';
  const eigene = eintraege.filter((e) => e.email === p.email);
  // Vor „Überstunden ab“: vom Start-Saldo rückwärts rechnen, damit frühere Monate unverändert bleiben.
  if (monat < ab) return runden(eigene.filter((e) => e.monat >= monat && e.monat < ab).reduce((s, e) => s - (e.ue - e.ueAusb), p.ueStartSaldo ?? 0));
  return runden(eigene.filter((e) => e.monat >= ab && e.monat < monat).reduce((s, e) => s + e.ue - e.ueAusb, p.ueStartSaldo ?? 0));
}

export interface BerichtZeile {
  email: string;
  name: string;
  gruppe: string;
  monat: string;
  uebertrag: number;
  neu: number;
  ausbezahlt: number;
  saldo: number;
  kr: number;
  ur: number;
  so: number;
  abgeschlossen: boolean;
  /** Info, wenn Urlaub oder Krankenstand über das Monatsende hinaus andauert. */
  andauernd?: string;
}

export const OHNE_GRUPPE = 'Standard';

export type BerichtGruppen = { gruppe: string; zeilen: BerichtZeile[] }[];

/** Archivierter Monatsbericht: fester Stand zum Zeitpunkt der Erstellung. */
export interface BerichtArchiv {
  id: string;
  monat: string;
  erstellt: number;
  von: string;
  einstellungen: ZeitkontoEinstellungen;
  gruppen: BerichtGruppen;
}

/** Gleicher Inhalt wie der letzte archivierte Stand des Monats? Dann kein neuer Eintrag. */
export const berichtGleich = (a: Pick<BerichtArchiv, 'einstellungen' | 'gruppen'>, b: Pick<BerichtArchiv, 'einstellungen' | 'gruppen'>) =>
  JSON.stringify([a.einstellungen, a.gruppen], ohneInfo) === JSON.stringify([b.einstellungen, b.gruppen], ohneInfo);
/** Die Andauern-Info ist nur ein Hinweis und macht einen Bericht nicht „geändert“. */
const ohneInfo = (k: string, v: unknown) => (k === 'andauernd' ? undefined : v);

const tagMonat = (d: string) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}.`;

/** Urlaub/Krankenstand, der über das Ende des Fehltage-Monats hinaus andauert, z. B. „Krankenstand dauert an (seit 17.11.)“. */
export function andauerndText(p: Pick<Personal, 'email'>, abw: Abwesenheit[], monat: string): string | undefined {
  const ende = `${monat}-31`;
  const a = abw.find((x) => x.email === p.email && (x.art === 'krank' || x.art === 'urlaub') && zaehlt(x) && x.von <= ende && (x.offen || x.bis > ende));
  if (!a) return undefined;
  const art = a.art === 'krank' ? 'Krankenstand' : 'Urlaub';
  return a.offen ? `${art} dauert an (seit ${tagMonat(a.von)})` : `${art} dauert an bis ${tagMonat(a.bis)}`;
}

/** Zeile je Mitarbeiter für den Berichtsmonat (Werte wie gespeichert bzw. Vorschlag aus dem Kalender). */
export function berichtZeile(p: Personal, abw: Abwesenheit[], d: ZeitkontoDaten, monat: string): BerichtZeile {
  const e = d.eintraege.find((x) => x.email === p.email && x.monat === monat);
  const k = kalenderTage(p, abw, monatPlus(monat, d.einstellungen.verschiebungAbw));
  const ue = uebertrag(p, d.eintraege, monat);
  const neu = e?.ue ?? 0;
  const ausbezahlt = e?.ueAusb ?? 0;
  return {
    email: p.email,
    name: p.name,
    gruppe: p.gruppe || OHNE_GRUPPE,
    monat,
    uebertrag: ue,
    neu,
    ausbezahlt,
    saldo: runden(ue + neu - ausbezahlt),
    kr: runden(k.kr + (e?.kr ?? 0)),
    ur: runden(k.ur + (e?.ur ?? 0)),
    so: runden(k.so + (e?.so ?? 0)),
    abgeschlossen: !!e,
    andauernd: andauerndText(p, abw, monatPlus(monat, d.einstellungen.verschiebungAbw)),
  };
}

const aktiv = (p: Personal, monat: string) => p.eintritt.slice(0, 7) <= monat && (!p.austritt || p.austritt.slice(0, 7) >= monat);

/** Monatsbericht: nur abgeschlossene Monate, nach Gruppe sortiert (Standard zuletzt), innerhalb der Gruppe in Personal-Reihenfolge. */
export function monatsbericht(personal: Personal[], abw: Abwesenheit[], d: ZeitkontoDaten, monat: string, nurAbgeschlossen = true): { gruppe: string; zeilen: BerichtZeile[] }[] {
  const zeilen = personal.filter((p) => aktiv(p, monat)).map((p) => berichtZeile(p, abw, d, monat)).filter((z) => !nurAbgeschlossen || z.abgeschlossen);
  const gruppen = [...new Set(zeilen.map((z) => z.gruppe))].sort((a, b) => (a === OHNE_GRUPPE ? 1 : b === OHNE_GRUPPE ? -1 : a.localeCompare(b, 'de')));
  return gruppen.map((g) => ({ gruppe: g, zeilen: zeilen.filter((z) => z.gruppe === g) }));
}

export const berichtHinweis = (monat: string, e: ZeitkontoEinstellungen) =>
  `Hinweis (Personalverrechnung): Überstunden sind aus Monat ${monatText(monatPlus(monat, e.verschiebungUe))} | Fehltage (Urlaub/Krank/ZA) aus Monat ${monatText(monatPlus(monat, e.verschiebungAbw))}.`;

export const BERICHT_SPALTEN = ['Name', 'Mon.', 'Ü-Übertrag', 'Ü-Neu', 'Ü-Ausz.', 'Ü-Saldo', 'Kr.', 'Ur.', 'So.'] as const;

export const zahlText = (x: number) => String(runden(x)).replace('.', ',');

export function berichtWerte(z: BerichtZeile): string[] {
  return [z.name, z.monat.slice(5, 7), zahlText(z.uebertrag), zahlText(z.neu), zahlText(z.ausbezahlt), zahlText(z.saldo), zahlText(z.kr), zahlText(z.ur), zahlText(z.so)];
}

const csvFeld = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV für Excel (Semikolon, Dezimalkomma, UTF-8 mit BOM). */
export function berichtCsv(gruppen: { gruppe: string; zeilen: BerichtZeile[] }[]): string {
  const kopf = ['Gruppe', 'Name', 'Monat', 'Ü-Übertrag', 'Ü-Neu', 'Ü-Ausz.', 'Ü-Saldo', 'Krank (Tage)', 'Urlaub (Tage)', 'Sonstiges (Tage)'];
  const zeilen = gruppen.flatMap((g) =>
    g.zeilen.map((z) => [g.gruppe, z.name, `${z.monat.slice(5, 7)}/${z.monat.slice(0, 4)}`, ...berichtWerte(z).slice(2)]),
  );
  return '\ufeff' + [kopf, ...zeilen].map((r) => r.map(csvFeld).join(';')).join('\r\n') + '\r\n';
}

const NACHTRAG_FELDER: [keyof BerichtZeile, string][] = [
  ['uebertrag', 'Ü-Übertrag'],
  ['neu', 'Ü-Neu'],
  ['ausbezahlt', 'Ü-Ausz.'],
  ['saldo', 'Ü-Saldo'],
  ['kr', 'Kr.'],
  ['ur', 'Ur.'],
  ['so', 'So.'],
];

/** Mitarbeiter, deren Berichtswerte sich gegenüber einem früheren (versendeten) Stand geändert haben. */
export interface NachtragZeile {
  gruppe: string;
  name: string;
  email: string;
  monat: string;
  alt?: BerichtZeile;
  neu?: BerichtZeile;
  /** Geänderte Felder (bei neu/entfallen alle). */
  felder: (keyof BerichtZeile)[];
}

/** Unterschiede zwischen einem früheren Stand und dem aktuellen Bericht (z. B. nachträglicher Krankenstand). */
export function berichtNachtrag(alt: BerichtGruppen, neu: BerichtGruppen): NachtragZeile[] {
  const a = new Map(alt.flatMap((g) => g.zeilen).map((z) => [z.email, z]));
  const n = new Map(neu.flatMap((g) => g.zeilen).map((z) => [z.email, z]));
  const alle = [...neu.flatMap((g) => g.zeilen), ...alt.flatMap((g) => g.zeilen).filter((z) => !n.has(z.email))];
  const aus: NachtragZeile[] = [];
  for (const z of alle) {
    const x = a.get(z.email);
    const y = n.get(z.email);
    const felder = NACHTRAG_FELDER.map(([k]) => k).filter((k) => !x || !y || runden(x[k] as number) !== runden(y[k] as number));
    if (felder.length) aus.push({ gruppe: (y ?? x)!.gruppe, name: (y ?? x)!.name, email: z.email, monat: z.monat, alt: x, neu: y, felder });
  }
  return aus;
}

/** Kurzbeschreibung der Änderung, z. B. „Kr. 2 → 5; Ü-Saldo 3 → 1“. */
export function nachtragText(z: NachtragZeile): string {
  if (!z.alt) return 'neu im Bericht';
  if (!z.neu) return 'entfällt';
  return NACHTRAG_FELDER.filter(([k]) => z.felder.includes(k))
    .map(([k, t]) => `${t} ${zahlText(z.alt![k] as number)} → ${zahlText(z.neu![k] as number)}`)
    .join('; ');
}

/** Tabellenzeile wie im Bericht, geänderte Werte als „alt → neu“. */
export function nachtragWerte(z: NachtragZeile): string[] {
  const w = (k: keyof BerichtZeile) =>
    z.alt && z.neu && z.felder.includes(k) ? `${zahlText(z.alt[k] as number)} → ${zahlText(z.neu[k] as number)}` : zahlText(((z.neu ?? z.alt)![k] as number) ?? 0);
  const name = z.alt ? (z.neu ? z.name : `${z.name} (entfällt)`) : `${z.name} (neu)`;
  return [name, z.monat.slice(5, 7), ...NACHTRAG_FELDER.map(([k]) => w(k))];
}

export function nachtragCsv(zeilen: NachtragZeile[]): string {
  const kopf = ['Gruppe', 'Name', 'Monat', 'Änderung', 'Ü-Übertrag', 'Ü-Neu', 'Ü-Ausz.', 'Ü-Saldo', 'Krank (Tage)', 'Urlaub (Tage)', 'Sonstiges (Tage)'];
  const liste = zeilen.map((z) => {
    const w = z.neu ?? z.alt!;
    return [z.gruppe, z.name, `${z.monat.slice(5, 7)}/${z.monat.slice(0, 4)}`, nachtragText(z), ...(z.neu ? berichtWerte(w).slice(2) : NACHTRAG_FELDER.map(() => ''))];
  });
  return '\ufeff' + [kopf, ...liste].map((r) => r.map(csvFeld).join(';')).join('\r\n') + '\r\n';
}

/** Monatsabschlüsse aus personal_daten.json (Liste „eintraege“) des alten Programms. */
export function altEintraegeLesen(x: unknown): Map<string, Omit<MonatsEintrag, 'email'>[]> {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const n = (v: unknown) => {
    const z = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return isFinite(z) ? runden(z) : 0;
  };
  const m = new Map<string, Omit<MonatsEintrag, 'email'>[]>();
  for (const e of Array.isArray(o.eintraege) ? (o.eintraege as Record<string, unknown>[]) : []) {
    const monat = `${String(e?.jahr ?? '').trim()}-${String(e?.monat ?? '').trim().padStart(2, '0')}`;
    if (!gueltigerMonat(monat) || e?.m_id == null) continue;
    const id = String(e.m_id);
    const liste = (m.get(id) ?? []).filter((x) => x.monat !== monat);
    liste.push({ monat, ue: n(e.ue), ueAusb: n(e.ue_ausb), kr: n(e.kr), ur: n(e.ur), so: n(e.so) });
    m.set(id, liste);
  }
  return m;
}

export const SPALTEN_ARTEN = { kr: ARTEN.krank.label, ur: ARTEN.urlaub.label, so: 'Sonstiges (Pflegeurlaub)' } as const;
