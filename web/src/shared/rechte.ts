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
  'Vorsorge',
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
  /** Externe Kraft: einteilbar, aber ohne Urlaub / Krank. */
  extern?: boolean;
}

export interface KalenderEintrag {
  id: string;
  name: string;
}

export interface DomainRegel {
  domain: string;
  gruppen: string[];
}

/** Vorgaben für den Alamida-Agent je Kategorie (leer = Einstellung am PC). */
export interface AgentKategorie {
  kalender?: string;
  dauer?: number;
  aktiv?: boolean;
}

export interface AgentEinstellungen {
  standardKalender?: string;
  kategorien: Record<string, AgentKategorie>;
}

export const AGENT_KATEGORIEN = KATEGORIE_SCHLUESSEL.filter((k) => k !== 'Sonstiges');
export const AGENT_STANDARD_DAUER: Record<string, number> = { Ueberfuehrung: 120 };

export interface Konfiguration {
  kalender: KalenderEintrag[];
  gruppen: Gruppe[];
  benutzer: Benutzer[];
  domains: DomainRegel[];
  /** Gruppen, deren Mitglieder alle zur Bereitschaft einteilen dürfen (Admins dürfen immer). */
  bereitschaftGruppen?: string[];
  /** Gruppen, die in der App neue Termine anlegen dürfen (Admins immer). */
  anlegenGruppen?: string[];
  /** Gruppen, die Personal bei Terminen einteilen dürfen (Admins immer). */
  personalGruppen?: string[];
  /** Gruppen, die Urlaub/Krank aller sehen und genehmigen (Admins immer). */
  abwesenheitGruppen?: string[];
  agent?: AgentEinstellungen;
  /** Mitarbeiter/Gruppen/Domains kommen aus dem Hub (nur lesend, nicht gespeichert). */
  hubVerwaltet?: boolean;
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

export function agentPruefen(x: unknown): AgentEinstellungen {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const ko = (o.kategorien && typeof o.kategorien === 'object' ? o.kategorien : {}) as Record<string, unknown>;
  const kategorien: Record<string, AgentKategorie> = {};
  for (const k of AGENT_KATEGORIEN) {
    const e = ko[k] as Record<string, unknown> | undefined;
    if (!e || typeof e !== 'object') continue;
    const dauer = Math.round(Number(e.dauer));
    const r: AgentKategorie = {};
    if (text(e.kalender, 300)) r.kalender = text(e.kalender, 300);
    if (dauer >= 15 && dauer <= 1440) r.dauer = dauer;
    if (e.aktiv === false) r.aktiv = false;
    if (Object.keys(r).length) kategorien[k] = r;
  }
  const standardKalender = text(o.standardKalender, 300);
  return standardKalender ? { standardKalender, kategorien } : { kategorien };
}

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
        admin: b.admin === true, ...(b.extern === true ? { extern: true } : {}),
      }))
      .filter((b) => b.email.includes('@')),
    domains: arr('domains')
      .map((d) => ({ domain: norm(text(d.domain, 100)).replace(/^@/, ''), gruppen: texte(d.gruppen).filter((g) => gruppenIds.has(g)) }))
      .filter((d) => d.domain.includes('.')),
    bereitschaftGruppen: texte(o.bereitschaftGruppen).filter((g) => g === ALLE || gruppenIds.has(g)),
    abwesenheitGruppen: texte(o.abwesenheitGruppen).filter((g) => g === ALLE || gruppenIds.has(g)),
    personalGruppen: texte(o.personalGruppen).filter((g) => g === ALLE || gruppenIds.has(g)),
    anlegenGruppen: texte(o.anlegenGruppen).filter((g) => g === ALLE || gruppenIds.has(g)),
    agent: agentPruefen(o.agent),
  };
}

/* ── Eine Quelle für Mitarbeiter und Gruppen: der Bestattung Stranz HUB ── */

/** Mitarbeiter, Gruppen und Domain-Regeln aus dem Hub (/api/verzeichnis). */
export interface Verzeichnis {
  gruppen: { id: string; name: string }[];
  benutzer: Benutzer[];
  domains: DomainRegel[];
}

export function verzeichnisPruefen(x: unknown): Verzeichnis | null {
  const o = (x && typeof x === 'object' ? x : null) as Record<string, unknown> | null;
  if (!o || !Array.isArray(o.gruppen) || !Array.isArray(o.benutzer)) return null;
  const arr = (k: string) => (Array.isArray(o[k]) ? (o[k] as Record<string, unknown>[]) : []);
  const gruppen = arr('gruppen')
    .map((g) => ({ id: text(g.id, 60), name: text(g.name, 80) }))
    .filter((g) => g.id && g.name);
  const ids = new Set(gruppen.map((g) => g.id));
  return {
    gruppen,
    benutzer: arr('benutzer')
      .map((b) => ({ email: text(b.email).toLowerCase(), name: text(b.name) || undefined, gruppen: texte(b.gruppen).filter((g) => ids.has(g)), admin: b.admin === true, ...(b.extern === true ? { extern: true } : {}) }))
      .filter((b) => b.email.includes('@')),
    domains: arr('domains')
      .map((d) => ({ domain: text(d.domain).toLowerCase(), gruppen: texte(d.gruppen).filter((g) => ids.has(g)) }))
      .filter((d) => d.domain.includes('.')),
  };
}

/**
 * Legt das Hub-Verzeichnis über die Kalender-Konfiguration: Mitarbeiter, Gruppen (Namen) und Domains kommen aus dem Hub,
 * der Kalender ergänzt je Gruppe nur, welche Kalender und Kategorien sie sieht (neue Hub-Gruppen: noch nichts).
 */
export function verzeichnisAnwenden(lokal: Konfiguration, v: Verzeichnis): Konfiguration {
  return {
    ...lokal,
    gruppen: v.gruppen.map((g) => {
      const l = lokal.gruppen.find((x) => x.id === g.id);
      return { id: g.id, name: g.name, kategorien: l?.kategorien ?? [], kalender: l?.kalender ?? [] };
    }),
    benutzer: v.benutzer,
    domains: v.domains,
    hubVerwaltet: true,
  };
}
