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
  return {
    termin: {
      kategorie,
      titel,
      datum,
      ...(zeit ? { zeit } : {}),
      dauer: zeit ? dauer : 0,
      ...(text(o.ort, 200) ? { ort: text(o.ort, 200) } : {}),
      ...(text(o.notiz, 2000) ? { notiz: text(o.notiz, 2000) } : {}),
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
    extendedProperties: { private: { kategorie: t.kategorie, quelle: WEB_QUELLE, angelegtVon: von.email } },
  };
}
