/** Rechteverwaltung: wer sieht welche Kalender und Kategorien. Wird vom Server (Netlify Functions) und der Admin-Ansicht genutzt. */

export const ALLE = '*';

export const KATEGORIE_SCHLUESSEL = [
  'Beisetzung',
  'Trauerfeier',
  'Rosenkranz',
  'Trauergespraech',
  'Abholung',
  'Ueberfuehrung',
  'Kremation',
  'Sonstiges',
] as const;

export interface Gruppe {
  id: string;
  name: string;
  /** Kategorie-Schlüssel oder ['*'] für alle. */
  kategorien: string[];
  /** Kalender-IDs oder ['*'] für alle. */
  kalender: string[];
}

export interface Benutzer {
  email: string;
  name?: string;
  gruppen: string[];
  admin?: boolean;
}

export interface KalenderEintrag {
  id: string;
  name: string;
}

export interface DomainRegel {
  domain: string;
  gruppen: string[];
}

export interface Konfiguration {
  kalender: KalenderEintrag[];
  gruppen: Gruppe[];
  benutzer: Benutzer[];
  domains: DomainRegel[];
}

export interface Rechte {
  email: string;
  admin: boolean;
  freigeschaltet: boolean;
  gruppen: string[];
  kategorien: string[];
  kalender: string[];
}

export const STANDARD_KONFIG: Konfiguration = {
  kalender: [],
  gruppen: [
    { id: 'buero', name: 'Büro', kategorien: [ALLE], kalender: [ALLE] },
    { id: 'fahrer', name: 'Fahrer', kategorien: ['Abholung', 'Ueberfuehrung', 'Kremation'], kalender: [ALLE] },
    { id: 'zeremonie', name: 'Zeremonie-Team', kategorien: ['Beisetzung', 'Trauerfeier', 'Rosenkranz'], kalender: [ALLE] },
  ],
  benutzer: [],
  domains: [],
};

const norm = (email: string) => email.trim().toLowerCase();

function vereinige(listen: string[][]): string[] {
  if (listen.some((l) => l.includes(ALLE))) return [ALLE];
  return [...new Set(listen.flat())];
}

export function rechteFuer(email: string, konfig: Konfiguration, adminEmails: string[] = []): Rechte {
  const e = norm(email);
  const benutzer = konfig.benutzer.find((b) => norm(b.email) === e);
  const admin = adminEmails.map(norm).includes(e) || !!benutzer?.admin;
  const domain = e.split('@')[1] ?? '';
  const gruppenIds = new Set([
    ...(benutzer?.gruppen ?? []),
    ...konfig.domains.filter((d) => norm(d.domain) === domain).flatMap((d) => d.gruppen),
  ]);
  const gruppen = konfig.gruppen.filter((g) => gruppenIds.has(g.id));
  if (admin) {
    return { email: e, admin, freigeschaltet: true, gruppen: gruppen.map((g) => g.id), kategorien: [ALLE], kalender: [ALLE] };
  }
  return {
    email: e,
    admin: false,
    freigeschaltet: gruppen.length > 0,
    gruppen: gruppen.map((g) => g.id),
    kategorien: vereinige(gruppen.map((g) => g.kategorien)),
    kalender: vereinige(gruppen.map((g) => g.kalender)),
  };
}

export function darfKalender(r: Rechte, kalenderId: string): boolean {
  return r.freigeschaltet && (r.kalender.includes(ALLE) || r.kalender.includes(kalenderId));
}

export function darfSehen(r: Rechte, kalenderId: string, kategorie: string): boolean {
  return darfKalender(r, kalenderId) && (r.kategorien.includes(ALLE) || r.kategorien.includes(kategorie));
}

const text = (x: unknown, max = 200) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const texte = (x: unknown) => (Array.isArray(x) ? x.map((y) => text(y)).filter(Boolean) : []);

/** Bereinigt eine vom Browser gesendete Konfiguration. */
export function konfigPruefen(x: unknown): Konfiguration {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const arr = (k: string) => (Array.isArray(o[k]) ? (o[k] as Record<string, unknown>[]) : []);
  const gruppen = arr('gruppen')
    .map((g) => ({ id: text(g.id, 60), name: text(g.name, 80), kategorien: texte(g.kategorien), kalender: texte(g.kalender) }))
    .filter((g) => g.id && g.name);
  const gruppenIds = new Set(gruppen.map((g) => g.id));
  return {
    kalender: arr('kalender')
      .map((k) => ({ id: text(k.id, 300), name: text(k.name, 80) || text(k.id, 80) }))
      .filter((k) => k.id),
    gruppen,
    benutzer: arr('benutzer')
      .map((b) => ({
        email: norm(text(b.email, 200)),
        name: text(b.name, 80) || undefined,
        gruppen: texte(b.gruppen).filter((g) => gruppenIds.has(g)),
        admin: b.admin === true,
      }))
      .filter((b) => b.email.includes('@')),
    domains: arr('domains')
      .map((d) => ({ domain: norm(text(d.domain, 100)).replace(/^@/, ''), gruppen: texte(d.gruppen).filter((g) => gruppenIds.has(g)) }))
      .filter((d) => d.domain.includes('.')),
  };
}
