import type { Config } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import {
  abwesenheitFehler,
  darfVerwalten,
  personalPruefen,
  ueberschneidet,
  type AbwArt,
  type AbwStatus,
  type Abwesenheit,
} from '../../src/shared/abwesenheit';
import {
  abwesenheitLoeschen,
  abwesenheitSpeichern,
  abwesenheitenLaden,
  angemeldet,
  json,
  personalLaden,
  personalSpeichern,
} from '../lib/server';

const neueId = () => randomBytes(9).toString('base64url');
const text = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Urlaub / Krank: GET Liste; POST eintragen/beantragen; POST ?aktion=entscheiden (genehmigen/ablehnen);
 * POST ?aktion=import (altes Programm); PUT ?aktion=personal (Stammdaten); DELETE ?id= zurückziehen/löschen.
 * Krankmeldungen gelten sofort, Urlaub & Co. brauchen eine Genehmigung (Verwalter tragen direkt genehmigt ein).
 */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'keine Freigabe' }, 403);
  const verwalter = darfVerwalten(a.rechte, a.konfig);
  const ich = a.sitzung.email.toLowerCase();
  const url = new URL(req.url);
  const aktion = url.searchParams.get('aktion');
  const [geladen, personalGeladen] = await Promise.all([abwesenheitenLaden(), personalLaden()]);
  let liste = geladen;
  let personal = personalGeladen;
  const b = req.method === 'GET' || req.method === 'DELETE' ? {} : ((await req.json().catch(() => ({}))) as Record<string, unknown>);
  const nur = (ok: boolean) => (ok ? null : json({ fehler: 'Dafür fehlt dir das Recht' }, 403));

  if (req.method === 'POST' && aktion === 'entscheiden') {
    const verboten = nur(verwalter);
    if (verboten) return verboten;
    const e = liste.find((x) => x.id === b.id);
    if (!e) return json({ fehler: 'Eintrag nicht gefunden' }, 404);
    if (b.status !== 'genehmigt' && b.status !== 'abgelehnt') return json({ fehler: 'Ungültige Entscheidung' }, 400);
    const grund = text(b.grund, 300);
    const neu: Abwesenheit = { ...e, status: b.status, entschieden: { von: ich, am: Date.now(), ...(grund ? { grund } : {}) } };
    await abwesenheitSpeichern(neu);
    liste = liste.map((x) => (x.id === e.id ? neu : x));
  } else if (req.method === 'POST' && aktion === 'import') {
    const verboten = nur(verwalter);
    if (verboten) return verboten;
    const neuP = personalPruefen(b.personal);
    const map = new Map(personal.map((p) => [p.email, p]));
    for (const p of neuP) map.set(p.email, p);
    personal = [...map.values()];
    await personalSpeichern(personal);
    const emails = new Set(neuP.map((p) => p.email));
    const schluessel = (x: Pick<Abwesenheit, 'email' | 'art' | 'von' | 'bis'>) => `${x.email}|${x.art}|${x.von}|${x.bis}`;
    const vorhanden = new Set(liste.map(schluessel));
    const neue: Abwesenheit[] = [];
    for (const r of Array.isArray(b.abwesenheiten) ? (b.abwesenheiten as Record<string, unknown>[]) : []) {
      const e = { email: text(r?.email, 200).toLowerCase(), art: r?.art as AbwArt, von: text(r?.von, 10), bis: text(r?.bis, 10) };
      if (!emails.has(e.email) || abwesenheitFehler(e) || vorhanden.has(schluessel(e))) continue;
      vorhanden.add(schluessel(e));
      neue.push({ id: neueId(), ...e, status: e.art === 'krank' ? 'gemeldet' : 'genehmigt', notiz: 'Import aus altem Programm', eingetragenVon: ich, erstellt: Date.now() });
    }
    if (neue.length > 5000) return json({ fehler: 'Zu viele Einträge auf einmal' }, 400);
    for (let i = 0; i < neue.length; i += 50) await Promise.all(neue.slice(i, i + 50).map(abwesenheitSpeichern));
    liste = [...liste, ...neue];
  } else if (req.method === 'POST') {
    const email = text(b.email, 200).toLowerCase() || ich;
    if (email !== ich && !verwalter) return json({ fehler: 'Du darfst nur für dich selbst eintragen' }, 403);
    if (email !== ich && !a.konfig.benutzer.some((x) => x.email === email) && !personal.some((p) => p.email === email)) {
      return json({ fehler: 'Unbekannter Mitarbeiter' }, 400);
    }
    const stunden = typeof b.stunden === 'number' ? b.stunden : undefined;
    const neu = { email, art: b.art as AbwArt, von: text(b.von, 10), bis: text(b.bis, 10), ...(stunden != null ? { stunden } : {}) };
    const fehler = abwesenheitFehler(neu);
    if (fehler) return json({ fehler }, 400);
    const doppelt = liste.some((x) => x.email === email && x.status !== 'abgelehnt' && x.stunden == null && neu.stunden == null && ueberschneidet(x, neu));
    if (doppelt) return json({ fehler: 'Für diesen Zeitraum ist schon eine Abwesenheit eingetragen' }, 400);
    const status: AbwStatus = neu.art === 'krank' ? 'gemeldet' : verwalter ? 'genehmigt' : 'beantragt';
    const notiz = text(b.notiz);
    const e: Abwesenheit = {
      id: neueId(),
      ...neu,
      status,
      ...(notiz ? { notiz } : {}),
      eingetragenVon: ich,
      erstellt: Date.now(),
      ...(status === 'genehmigt' ? { entschieden: { von: ich, am: Date.now() } } : {}),
    };
    await abwesenheitSpeichern(e);
    liste = [...liste, e];
  } else if (req.method === 'PUT' && aktion === 'personal') {
    const verboten = nur(verwalter);
    if (verboten) return verboten;
    personal = personalPruefen(b.personal);
    await personalSpeichern(personal);
  } else if (req.method === 'DELETE') {
    const e = liste.find((x) => x.id === url.searchParams.get('id'));
    if (!e) return json({ fehler: 'Eintrag nicht gefunden' }, 404);
    if (!verwalter && !(e.email === ich && e.status === 'beantragt')) return json({ fehler: 'Nur offene Anträge können zurückgezogen werden' }, 403);
    await abwesenheitLoeschen(e);
    liste = liste.filter((x) => x.id !== e.id);
  }

  const nameVon = (email: string) =>
    a.konfig.benutzer.find((x) => x.email === email)?.name ?? personal.find((p) => p.email === email)?.name ?? (email === ich ? a.sitzung.name : undefined);
  const mitName = (e: Abwesenheit) => {
    const name = nameVon(e.email);
    return name ? { ...e, name } : e;
  };
  liste.sort((x, y) => x.von.localeCompare(y.von));
  const eintraege = verwalter
    ? liste.map(mitName)
    : liste
        .filter((e) => e.email === ich || e.status === 'genehmigt' || e.status === 'gemeldet')
        .map((e) =>
          e.email === ich
            ? mitName(e)
            : mitName({ id: e.id, email: e.email, art: 'sonstiges', von: e.von, bis: e.bis, ...(e.stunden != null ? { stunden: e.stunden } : {}), status: 'genehmigt', verdeckt: true }),
        );
  const personen = verwalter
    ? [...new Map([...personal.map((p) => [p.email, { email: p.email, name: p.name }] as const), ...a.konfig.benutzer.map((x) => [x.email, { email: x.email, name: x.name ?? nameVon(x.email) }] as const)]).values()]
    : [];
  return json({
    ich: { email: ich, name: a.sitzung.name },
    darfVerwalten: verwalter,
    personal: verwalter ? personal : personal.filter((p) => p.email === ich),
    eintraege,
    personen,
  });
};

export const config: Config = { path: '/api/abwesenheit', method: ['GET', 'POST', 'PUT', 'DELETE'] };
