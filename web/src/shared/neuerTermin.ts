import { AGENT_STANDARD_DAUER, ALLE, type Konfiguration, type Rechte } from './rechte';

/** Neuer Termin aus der Web-App (Klick auf einen Tag), wird in den Google-Kalender der Kategorie geschrieben. */
export interface NeuerTermin {
  kategorie: string;
  titel: string;
  /** JJJJ-MM-TT */
  datum: string;
  /** HH:mm – fehlt bei ganztägig */
  zeit?: string;
  /** Minuten */
  dauer: number;
  ort?: string;
  notiz?: string;
  /** Nur beim Anlegen: Serie (z. B. Reinigungsplan). */
  wiederholung?: Wiederholung;
  /** Punkte zum Abhaken, je Termin der Serie eigener Stand. */
  checkliste?: string[];
  /** Leer = alle mit Recht auf die Kategorie. Sonst nur diese Gruppen/Personen (+ Ersteller, Admins). */
  sichtGruppen?: string[];
  sichtPersonen?: string[];
}

export interface Wiederholung {
  art: 'taeglich' | 'woechentlich' | 'monatlich';
  /** Alle n Tage/Wochen/Monate */
  alle: number;
  /** Wochentage 0 = Mo … 6 = So (nur wöchentlich) */
  tage?: number[];
  /** JJJJ-MM-TT, leer = ohne Ende */
  bis?: string;
}

const FREQ = { taeglich: 'DAILY', woechentlich: 'WEEKLY', monatlich: 'MONTHLY' } as const;
const WT = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** RFC-5545-Regel für Google; bei ganztägigen Terminen UNTIL als Datum. */
export function rrule(w: Wiederholung, ganztaegig: boolean): string {
  const t = [`FREQ=${FREQ[w.art]}`];
  if (w.alle > 1) t.push(`INTERVAL=${w.alle}`);
  if (w.art === 'woechentlich' && w.tage?.length) t.push(`BYDAY=${w.tage.map((x) => WT[x]).join(',')}`);
  if (w.bis) t.push(`UNTIL=${w.bis.replace(/-/g, '')}${ganztaegig ? '' : 'T235959Z'}`);
  return `RRULE:${t.join(';')}`;
}

const liste = (v?: string) => (v ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/** Termin mit eingeschränkter Sichtbarkeit nur für Admins, Ersteller, gewählte Gruppen und Personen. */
export function terminSichtbar(r: Rechte, p?: Record<string, string>): boolean {
  const gruppen = liste(p?.sichtGruppen);
  const personen = liste(p?.sichtPersonen);
  if (r.admin || (!gruppen.length && !personen.length)) return true;
  const ich = r.email.toLowerCase();
  return p?.angelegtVon === ich || personen.includes(ich) || r.gruppen.some((g) => gruppen.includes(g));
}

export const checklisteAus = (p?: Record<string, string>) => (p?.checkliste ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
export const sichtAus = (p?: Record<string, string>) => ({ gruppen: liste(p?.sichtGruppen), personen: liste(p?.sichtPersonen) });

/** Zusatzfelder für extendedProperties.private (Google erlaubt max. 1024 Zeichen je Wert). */
export function zusatzEigenschaften(t: NeuerTermin): Record<string, string> {
  return {
    ...(t.checkliste?.length ? { checkliste: t.checkliste.join('\n') } : {}),
    ...(t.sichtGruppen?.length ? { sichtGruppen: t.sichtGruppen.join(',') } : {}),
    ...(t.sichtPersonen?.length ? { sichtPersonen: t.sichtPersonen.join(',') } : {}),
  };
}

export const WEB_QUELLE = 'web';

/** Admins und die unter „Rechte“ → „Termine anlegen“ gewählten Gruppen. */
export function darfAnlegen(r: Rechte, k: Konfiguration): boolean {
  if (r.admin) return true;
  const g = k.anlegenGruppen ?? [];
  return r.freigeschaltet && (g.includes(ALLE) || r.gruppen.some((x) => g.includes(x)));
}

/** Ziel-Kalender wie beim Agent: Kalender der Kategorie, sonst Standard-Kalender, sonst der erste eingetragene. */
export function zielKalender(k: Konfiguration, kategorie: string): string | null {
  const gueltig = (x?: string) => (x && x !== 'primary' ? x : undefined);
  return gueltig(k.agent?.kategorien?.[kategorie]?.kalender) ?? gueltig(k.agent?.standardKalender) ?? k.kalender[0]?.id ?? null;
}

export const standardDauer = (k: Konfiguration, kategorie: string) => k.agent?.kategorien?.[kategorie]?.dauer || AGENT_STANDARD_DAUER[kategorie] || 60;

const text = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

export function neuerTerminPruefen(x: unknown, kategorien: readonly string[]): { termin: NeuerTermin } | { fehler: string } {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const kategorie = text(o.kategorie, 40);
  if (!kategorien.includes(kategorie)) return { fehler: 'Bitte eine Kategorie wählen' };
  const titel = text(o.titel, 150);
  if (!titel) return { fehler: 'Bitte einen Titel bzw. Namen eingeben' };
  const datum = text(o.datum, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(datum))) return { fehler: 'Ungültiges Datum' };
  const zeit = text(o.zeit, 5);
  if (zeit && !/^([01]\d|2[0-3]):[0-5]\d$/.test(zeit)) return { fehler: 'Ungültige Uhrzeit' };
  const dauer = Math.round(Number(o.dauer));
  if (zeit && !(dauer >= 5 && dauer <= 24 * 60)) return { fehler: 'Dauer zwischen 5 Minuten und 24 Stunden' };
  const texte = (v: unknown, max: number, anzahl: number) => (Array.isArray(v) ? [...new Set(v.map((y) => text(y, max)).filter(Boolean))].slice(0, anzahl) : []);
  const checkliste = texte(o.checkliste, 100, 40).map((x) => x.replace(/\s+/g, ' '));
  const sichtGruppen = texte(o.sichtGruppen, 60, 30).map((x) => x.replace(/,/g, ''));
  const sichtPersonen = texte(o.sichtPersonen, 120, 30).map((x) => x.toLowerCase().replace(/,/g, ''));
  if (checkliste.join('\n').length > 1000) return { fehler: 'Checkliste zu lang (max. 1000 Zeichen)' };
  if (sichtGruppen.join(',').length > 1000 || sichtPersonen.join(',').length > 1000) return { fehler: 'Zu viele Gruppen bzw. Personen gewählt' };
  let wiederholung: Wiederholung | undefined;
  const w = (o.wiederholung && typeof o.wiederholung === 'object' ? o.wiederholung : null) as Record<string, unknown> | null;
  if (w) {
    const art = text(w.art, 20) as Wiederholung['art'];
    if (!(art in FREQ)) return { fehler: 'Ungültige Wiederholung' };
    const alle = Math.round(Number(w.alle) || 1);
    if (!(alle >= 1 && alle <= 99)) return { fehler: 'Wiederholung: alle 1 bis 99' };
    const tage = Array.isArray(w.tage) ? [...new Set(w.tage.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort() : [];
    const bis = text(w.bis, 10);
    if (bis && (!/^\d{4}-\d{2}-\d{2}$/.test(bis) || bis < datum)) return { fehler: 'Wiederholung: Ende muss nach dem ersten Termin liegen' };
    wiederholung = { art, alle, ...(art === 'woechentlich' && tage.length ? { tage } : {}), ...(bis ? { bis } : {}) };
  }
  return {
    termin: {
      kategorie,
      titel,
      datum,
      ...(zeit ? { zeit } : {}),
      dauer: zeit ? dauer : 0,
      ...(text(o.ort, 200) ? { ort: text(o.ort, 200) } : {}),
      ...(text(o.notiz, 2000) ? { notiz: text(o.notiz, 2000) } : {}),
      ...(wiederholung ? { wiederholung } : {}),
      ...(checkliste.length ? { checkliste } : {}),
      ...(sichtGruppen.length ? { sichtGruppen } : {}),
      ...(sichtPersonen.length ? { sichtPersonen } : {}),
    },
  };
}

/** Ortszeit-Arithmetik ohne Zeitzone: „JJJJ-MM-TTTHH:mm:00“ + Minuten. */
function plusMinuten(datum: string, zeit: string, min: number): string {
  const [j, m, t] = datum.split('-').map(Number);
  const [h, mi] = zeit.split(':').map(Number);
  return new Date(Date.UTC(j, m - 1, t, h, mi + min)).toISOString().slice(0, 19);
}

export function googleEreignis(t: NeuerTermin, anzeige: { symbol: string; label: string }, von: { email: string; name?: string }) {
  const zeitraum = t.zeit
    ? {
        start: { dateTime: `${t.datum}T${t.zeit}:00`, timeZone: 'Europe/Vienna' },
        end: { dateTime: plusMinuten(t.datum, t.zeit, t.dauer), timeZone: 'Europe/Vienna' },
      }
    : { start: { date: t.datum }, end: { date: plusMinuten(t.datum, '00:00', 24 * 60).slice(0, 10) } };
  return {
    summary: `${anzeige.symbol} ${anzeige.label} ${t.titel}`,
    ...(t.ort ? { location: t.ort } : {}),
    description: [t.notiz, `Angelegt von ${von.name ?? von.email} in der Kalender-App`].filter(Boolean).join('\n\n'),
    ...zeitraum,
    ...(t.wiederholung ? { recurrence: [rrule(t.wiederholung, !t.zeit)] } : {}),
    extendedProperties: { private: { kategorie: t.kategorie, quelle: WEB_QUELLE, angelegtVon: von.email, ...zusatzEigenschaften(t) } },
  };
}
