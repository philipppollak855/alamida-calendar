import type { Config } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import {
  BELEG_ARTEN,
  BELEG_MAX_ANZAHL,
  BELEG_MAX_BYTES,
  BELEG_TYPEN,
  abwesenheitFehler,
  belegDateiname,
  belegSignaturPasst,
  type Beleg,
  darfVerwalten,
  personalPruefen,
  ueberschneidet,
  type AbwArt,
  type AbwStatus,
  type Abwesenheit, umbenennungen } from '../../src/shared/abwesenheit';
import {
  abwesenheitLoeschen,
  abwesenheitSpeichern,
  abwesenheitenLaden,
  angemeldet,
  belegLaden,
  belegLoeschen,
  belegSpeichern,
  json,
  personalLaden,
  personalSpeichern,
} from '../lib/server';

const neueId = () => randomBytes(9).toString('base64url');
const text = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Urlaub / Krank: GET Liste; POST eintragen/beantragen; POST ?aktion=entscheiden (genehmigen/ablehnen);
 * POST ?aktion=import (altes Programm); PUT ?aktion=personal (Stammdaten); DELETE ?id= zurückziehen/löschen;
 * ?aktion=beleg&id=…(&beleg=…): Bestätigung hochladen (POST, Datei als Body), abrufen (GET), entfernen (DELETE).
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
  const b = req.method === 'GET' || req.method === 'DELETE' || aktion === 'beleg' ? {} : ((await req.json().catch(() => ({}))) as Record<string, unknown>);
  const nur = (ok: boolean) => (ok ? null : json({ fehler: 'Dafür fehlt dir das Recht' }, 403));

  if (aktion === 'beleg') {
    const e = liste.find((x) => x.id === url.searchParams.get('id'));
    if (!e) return json({ fehler: 'Eintrag nicht gefunden' }, 404);
    if (!verwalter && e.email !== ich) return json({ fehler: 'Dafür fehlt dir das Recht' }, 403);
    const belegId = url.searchParams.get('beleg') ?? '';
    const info = e.belege?.find((x) => x.id === belegId);
    if (req.method === 'GET') {
      const datei = info && (await belegLaden(info.id));
      if (!info || !datei) return json({ fehler: 'Datei nicht gefunden' }, 404);
      return new Response(datei, {
        headers: {
          'content-type': info.typ,
          'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(info.name)}`,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    }
    if (req.method === 'POST') {
      if (!BELEG_ARTEN.includes(e.art)) return json({ fehler: 'Bestätigungen gibt es nur bei Krankenstand und Pflegeurlaub' }, 400);
      if (e.status === 'abgelehnt') return json({ fehler: 'Der Eintrag wurde abgelehnt' }, 400);
      if ((e.belege?.length ?? 0) >= BELEG_MAX_ANZAHL) return json({ fehler: `Höchstens ${BELEG_MAX_ANZAHL} Dateien je Eintrag` }, 400);
      const typ = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!BELEG_TYPEN.includes(typ)) return json({ fehler: 'Bitte ein PDF oder Foto (JPG, PNG, WebP, HEIC) senden' }, 400);
      const daten = await req.arrayBuffer();
      if (!daten.byteLength) return json({ fehler: 'Die Datei ist leer' }, 400);
      if (daten.byteLength > BELEG_MAX_BYTES) return json({ fehler: 'Die Datei ist zu groß (höchstens 4,5 MB)' }, 400);
      if (!belegSignaturPasst(new Uint8Array(daten.slice(0, 16)), typ)) return json({ fehler: 'Der Inhalt passt nicht zum Dateityp' }, 400);
      let roh = '';
      try {
        roh = decodeURIComponent(req.headers.get('x-dateiname') ?? '').slice(0, 200);
      } catch {
        roh = '';
      }
      const neuerBeleg: Beleg = { id: neueId(), name: belegDateiname(roh, typ), typ, groesse: daten.byteLength, am: Date.now(), von: ich };
      await belegSpeichern(neuerBeleg.id, daten, typ);
      const neu: Abwesenheit = { ...e, belege: [...(e.belege ?? []), neuerBeleg] };
      await abwesenheitSpeichern(neu);
      liste = liste.map((x) => (x.id === e.id ? neu : x));
    } else if (req.method === 'DELETE') {
      if (!info) return json({ fehler: 'Datei nicht gefunden' }, 404);
      if (!verwalter && info.von !== ich) return json({ fehler: 'Nur das Büro kann diese Datei entfernen' }, 403);
      await belegLoeschen(info.id);
      const rest = (e.belege ?? []).filter((x) => x.id !== info.id);
      const { belege: _alt, ...ohne } = e;
      const neu: Abwesenheit = rest.length ? { ...ohne, belege: rest } : ohne;
      await abwesenheitSpeichern(neu);
      liste = liste.map((x) => (x.id === e.id ? neu : x));
    } else return json({ fehler: 'Methode nicht erlaubt' }, 405);
  } else if (req.method === 'POST' && aktion === 'entscheiden') {
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
    const umb = umbenennungen(b.personal);
    personal = personalPruefen(b.personal);
    await personalSpeichern(personal);
    if (umb.size) {
      const geaendert = liste.filter((x) => umb.has(x.email)).map((x) => ({ ...x, email: umb.get(x.email)! }));
      for (let i = 0; i < geaendert.length; i += 50) await Promise.all(geaendert.slice(i, i + 50).map(abwesenheitSpeichern));
      const neu = new Map(geaendert.map((x) => [x.id, x]));
      liste = liste.map((x) => neu.get(x.id) ?? x);
    }
  } else if (req.method === 'DELETE') {
    const e = liste.find((x) => x.id === url.searchParams.get('id'));
    if (!e) return json({ fehler: 'Eintrag nicht gefunden' }, 404);
    if (!verwalter && !(e.email === ich && e.status === 'beantragt')) return json({ fehler: 'Nur offene Anträge können zurückgezogen werden' }, 403);
    await Promise.all((e.belege ?? []).map((x) => belegLoeschen(x.id)));
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
  const externe = a.konfig.benutzer.filter((x) => x.extern).map((x) => x.email);
  const personen = verwalter
    ? [
        ...new Map([
          ...personal.map((p) => [p.email, { email: p.email, name: p.name }] as const),
          ...a.konfig.benutzer.filter((x) => !x.extern).map((x) => [x.email, { email: x.email, name: x.name ?? nameVon(x.email) }] as const),
        ]).values(),
      ].filter((p) => !externe.includes(p.email))
    : [];
  return json({
    ich: { email: ich, name: a.sitzung.name },
    darfVerwalten: verwalter,
    personal: verwalter ? personal : personal.filter((p) => p.email === ich),
    eintraege,
    personen,
    externe: verwalter ? externe : [],
  });
};

export const config: Config = { path: '/api/abwesenheit', method: ['GET', 'POST', 'PUT', 'DELETE'] };
