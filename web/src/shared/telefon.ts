/** Telefondienst: Mitschriften von Anrufen (Sterbefall oder Anliegen), Übergabe an die Bereitschaft, Archiv. */
import { hatRolle, rolleVergeben, type MitRollen } from './rollen';
import type { Rechte } from './rechte';

export type MitschriftArt = 'sterbefall' | 'anliegen';
export type OrtArt = 'zuhause' | 'krankenhaus' | 'pflegeheim' | 'sonstig';
export type MitschriftStatus = 'offen' | 'uebergeben' | 'abgeschlossen' | 'erledigt';

export const ORT_ARTEN: { id: OrtArt; label: string; symbol: string }[] = [
  { id: 'zuhause', label: 'Zuhause / Adresse', symbol: '🏠' },
  { id: 'krankenhaus', label: 'Krankenhaus', symbol: '🏥' },
  { id: 'pflegeheim', label: 'Pflegeheim', symbol: '🛏' },
  { id: 'sonstig', label: 'Sonstiges', symbol: '📍' },
];
export const STATUS_TEXT: Record<MitschriftStatus, string> = {
  offen: 'offen',
  uebergeben: 'an Bereitschaft übergeben',
  abgeschlossen: 'abgeholt',
  erledigt: 'erledigt',
};

export interface Aufnahme {
  id: string;
  typ: string;
  groesse: number;
  am: number;
  von: string;
}

export interface Mitschrift {
  id: string;
  art: MitschriftArt;
  /** Zeitpunkt des Anrufs (ms). */
  zeit: number;
  erstellt: number;
  von: string;
  vonName?: string;
  anrufer: string;
  nummer: string;
  notiz: string;
  // Sterbefall
  verstorbener?: string;
  geburtsdatum?: string;
  ortArt?: OrtArt;
  ort?: string;
  ortNotiz?: string;
  hausarzt?: string;
  polizei?: boolean;
  // Anliegen
  anliegen?: string;
  /** Zugehöriger Sterbefall (Mitschrift-ID). */
  fall?: string;
  status: MitschriftStatus;
  uebergabe?: { am: number; von: string; an: { email: string; name?: string }[] };
  abholung?: { am: number; von: string; kuehlraum: string; notiz?: string };
  aufnahme?: Aufnahme;
  geaendert?: { am: number; von: string };
}

export const AUFNAHME_MAX_BYTES = 5_500_000;
export const AUFNAHME_TYPEN = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac'];

/** Grobe Inhaltsprüfung der Audiodatei anhand der ersten Bytes. */
export function aufnahmeSignaturPasst(b: Uint8Array, typ: string): boolean {
  const ascii = (von: number, bis: number) => String.fromCharCode(...b.slice(von, bis));
  switch (typ) {
    case 'audio/webm':
      return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case 'audio/ogg':
      return ascii(0, 4) === 'OggS';
    case 'audio/mp4':
    case 'audio/x-m4a':
      return ascii(4, 8) === 'ftyp';
    case 'audio/mpeg':
      return ascii(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    case 'audio/aac':
      return b[0] === 0xff && (b[1] & 0xf0) === 0xf0;
    case 'audio/wav':
    case 'audio/x-wav':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
    default:
      return false;
  }
}

/** Telefondienst: Admins, Rolle Telefon (solange niemand die Rolle hat: alle Freigeschalteten). */
export const darfTelefon = (r: Rechte, personen: MitRollen[]) =>
  r.admin || (r.freigeschaltet && (!rolleVergeben(personen, 'telefon') || hatRolle(personen.find((p) => p.email === r.email), 'telefon')));
/** Abholung abschließen: Telefondienst und Rolle Bereitschaft. */
export const darfAbholen = (r: Rechte, personen: MitRollen[]) =>
  darfTelefon(r, personen) || (r.freigeschaltet && (!rolleVergeben(personen, 'bereitschaft') || hatRolle(personen.find((p) => p.email === r.email), 'bereitschaft')));

const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const datum = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : '');

/** Bereinigt die vom Formular gesendeten Felder. Gibt einen Fehlertext zurück, wenn Pflichtangaben fehlen. */
export function eingabePruefen(x: unknown, jetzt = Date.now()): { felder: Partial<Mitschrift>; fehler: string | null } {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const art: MitschriftArt = o.art === 'anliegen' ? 'anliegen' : 'sterbefall';
  const z = Number(o.zeit);
  const felder: Partial<Mitschrift> = {
    art,
    // Anrufzeit: höchstens 7 Tage zurück und nicht in der Zukunft (sonst jetzt).
    zeit: Number.isFinite(z) && z <= jetzt + 60_000 && z > jetzt - 7 * 86_400_000 ? Math.round(z) : jetzt,
    anrufer: text(o.anrufer, 120),
    nummer: text(o.nummer, 40).replace(/[^\d+()/ -]/g, ''),
    notiz: text(o.notiz, 4000),
  };
  if (art === 'sterbefall') {
    Object.assign(felder, {
      verstorbener: text(o.verstorbener, 120),
      geburtsdatum: datum(o.geburtsdatum) || undefined,
      ortArt: ORT_ARTEN.some((a) => a.id === o.ortArt) ? (o.ortArt as OrtArt) : 'zuhause',
      ort: text(o.ort, 200),
      ortNotiz: text(o.ortNotiz, 500) || undefined,
      hausarzt: text(o.hausarzt, 120) || undefined,
      polizei: o.polizei === true || undefined,
    });
    if (!felder.verstorbener && !felder.ort) return { felder, fehler: 'Bitte Name des Verstorbenen oder den Sterbeort eintragen' };
  } else {
    Object.assign(felder, { anliegen: text(o.anliegen, 4000), fall: text(o.fall, 40) || undefined });
    if (!felder.anliegen) return { felder, fehler: 'Bitte das Anliegen eintragen' };
  }
  if (!felder.anrufer && !felder.nummer) return { felder, fehler: 'Bitte Anrufer oder Telefonnummer eintragen' };
  return { felder, fehler: null };
}

/** Offene Daten bei der Abholung nachtragen: nur leere Felder werden überschrieben. */
export function nachtragen(m: Mitschrift, x: unknown): Mitschrift {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const neu = { ...m };
  if (!m.verstorbener && text(o.verstorbener, 120)) neu.verstorbener = text(o.verstorbener, 120);
  if (!m.geburtsdatum && datum(o.geburtsdatum)) neu.geburtsdatum = datum(o.geburtsdatum);
  if (!m.ort && text(o.ort, 200)) neu.ort = text(o.ort, 200);
  if (!m.hausarzt && text(o.hausarzt, 120)) neu.hausarzt = text(o.hausarzt, 120);
  return neu;
}

export const titel = (m: Pick<Mitschrift, 'art' | 'verstorbener' | 'anliegen' | 'anrufer' | 'nummer'>) =>
  m.art === 'sterbefall' ? m.verstorbener || 'Sterbefall (Name offen)' : (m.anliegen ?? '').split('\n')[0].slice(0, 80) || m.anrufer || m.nummer;

export const istOffen = (m: Pick<Mitschrift, 'status'>) => m.status === 'offen' || m.status === 'uebergeben';

/** Volltextsuche (alle Wörter müssen vorkommen) plus Filter nach Art, Status und Zeitraum (JJJJ-MM-TT, Ortszeit egal: Tagesgrenze UTC+1 reicht für die Suche). */
export function suchen(
  liste: Mitschrift[],
  f: { text?: string; art?: MitschriftArt | ''; status?: 'offen' | 'fertig' | ''; von?: string; bis?: string },
): Mitschrift[] {
  const woerter = (f.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const von = f.von ? Date.parse(`${f.von}T00:00:00+01:00`) : -Infinity;
  const bis = f.bis ? Date.parse(`${f.bis}T23:59:59+01:00`) : Infinity;
  return liste.filter((m) => {
    if (f.art && m.art !== f.art) return false;
    if (f.status === 'offen' && !istOffen(m)) return false;
    if (f.status === 'fertig' && istOffen(m)) return false;
    if (m.zeit < von || m.zeit > bis) return false;
    if (!woerter.length) return true;
    const heu = [m.verstorbener, m.anrufer, m.nummer, m.notiz, m.ort, m.ortNotiz, m.hausarzt, m.anliegen, m.vonName, m.abholung?.kuehlraum, m.abholung?.notiz]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return woerter.every((w) => heu.includes(w));
  });
}

const zeitText = (ms: number) =>
  new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms);
export { zeitText };

const ortText = (m: Mitschrift) => [ORT_ARTEN.find((a) => a.id === m.ortArt)?.label, m.ort, m.ortNotiz].filter(Boolean).join(' – ');

/** Text zum Teilen (z. B. per WhatsApp/SMS an die Bereitschaft). */
export function teilText(m: Mitschrift): string {
  const z = [`📞 ${m.art === 'sterbefall' ? 'Sterbefall' : 'Anliegen'} – ${zeitText(m.zeit)}`];
  if (m.art === 'sterbefall') {
    z.push(`Verstorben: ${m.verstorbener || '–'}${m.geburtsdatum ? ` (geb. ${m.geburtsdatum.split('-').reverse().join('.')})` : ''}`);
    z.push(`Sterbeort: ${ortText(m) || '–'}`);
    if (m.hausarzt) z.push(`Hausarzt: ${m.hausarzt}`);
    if (m.polizei) z.push('🚓 Polizeieinsatz');
  } else z.push(`Anliegen: ${m.anliegen}`);
  z.push(`Anrufer: ${[m.anrufer, m.nummer].filter(Boolean).join(', ') || '–'}`);
  if (m.notiz) z.push(`Notiz: ${m.notiz}`);
  return z.join('\n');
}

/** CSV (Semikolon, für Excel) aller übergebenen Mitschriften. */
export function csv(liste: Mitschrift[]): string {
  const k = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const kopf = ['Zeit', 'Art', 'Status', 'Verstorbener', 'Geburtsdatum', 'Sterbeort', 'Hausarzt', 'Polizei', 'Anliegen', 'Anrufer', 'Nummer', 'Notiz', 'Aufgenommen von', 'Übergeben', 'Kühlraum', 'Abgeholt', 'Aufnahme'];
  const zeilen = liste.map((m) =>
    [
      zeitText(m.zeit),
      m.art === 'sterbefall' ? 'Sterbefall' : 'Anliegen',
      STATUS_TEXT[m.status],
      m.verstorbener,
      m.geburtsdatum,
      m.art === 'sterbefall' ? ortText(m) : '',
      m.hausarzt,
      m.polizei ? 'ja' : '',
      m.anliegen,
      m.anrufer,
      m.nummer,
      m.notiz,
      m.vonName || m.von,
      m.uebergabe ? `${zeitText(m.uebergabe.am)} an ${m.uebergabe.an.map((p) => p.name || p.email).join(', ')}` : '',
      m.abholung?.kuehlraum,
      m.abholung ? zeitText(m.abholung.am) : '',
      m.aufnahme ? 'ja' : '',
    ]
      .map(k)
      .join(';'),
  );
  return '\ufeff' + [kopf.join(';'), ...zeilen].join('\r\n');
}
