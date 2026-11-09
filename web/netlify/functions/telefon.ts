import type { Config } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import { ortszeit } from '../../src/shared/heute';
import {
  AUFNAHME_MAX_BYTES,
  AUFNAHME_TYPEN,
  aufnahmeSignaturPasst,
  darfAbholen,
  darfTelefon,
  eingabePruefen,
  istOffen,
  nachtragen,
  type Mitschrift,
} from '../../src/shared/telefon';
import {
  angemeldet,
  aufnahmeLaden,
  aufnahmeLoeschen,
  aufnahmeSpeichern,
  bereitschaftLaden,
  json,
  mitschriftenLaden,
  mitschriftLoeschen,
  mitschriftSpeichern,
  telefonJetztLaden,
} from '../lib/server';

const neueId = () => `${Date.now().toString(36)}-${randomBytes(6).toString('base64url')}`;
const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Telefondienst. GET: Mitschriften (Telefon: alle; Bereitschaft: übergebene Sterbefälle). POST: neu (optional gleich übergeben),
 * PUT ?id=: bearbeiten, DELETE ?id=: löschen (Admin). POST ?aktion=uebergeben|abholung|erledigt&id=.
 * ?aktion=aufnahme&id=: Mitschnitt hochladen (POST, Datei als Body), abrufen (GET), entfernen (DELETE).
 */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'keine Freigabe' }, 403);
  const personen = a.konfig.benutzer.map((b) => ({ email: b.email.toLowerCase(), rollen: b.rollen }));
  const telefon = darfTelefon(a.rechte, personen);
  const abholen = darfAbholen(a.rechte, personen);
  if (!abholen) return json({ fehler: 'Der Telefondienst ist nur für Mitarbeiter mit Rolle Telefon oder Bereitschaft' }, 403);

  const url = new URL(req.url);
  const aktion = url.searchParams.get('aktion') ?? '';
  const id = url.searchParams.get('id') ?? '';
  const ich = a.sitzung.email.toLowerCase();
  const nameVon = (email: string) => a.konfig.benutzer.find((b) => b.email.toLowerCase() === email)?.name;
  const sichtbar = (m: Mitschrift) => telefon || (m.art === 'sterbefall' && m.status !== 'offen');
  const verboten = () => json({ fehler: 'Dafür fehlt dir das Recht' }, 403);

  let liste = await mitschriftenLaden();
  const m = id ? liste.find((x) => x.id === id) : undefined;
  if (id && (!m || !sichtbar(m))) return json({ fehler: 'Mitschrift nicht gefunden' }, 404);
  const speichern = async (neu: Mitschrift) => {
    await mitschriftSpeichern(neu);
    liste = liste.some((x) => x.id === neu.id) ? liste.map((x) => (x.id === neu.id ? neu : x)) : [neu, ...liste];
  };

  async function bereitschaftJetzt() {
    const jetzt = ortszeit(new Date());
    const l = await bereitschaftLaden(jetzt.slice(0, 10)).catch(() => []);
    const aktiv = l.filter((e) => e.von <= jetzt && e.bis > jetzt);
    return [...new Map(aktiv.map((e) => [e.email, { email: e.email, ...((nameVon(e.email) ?? e.name) ? { name: nameVon(e.email) ?? e.name } : {}) }])).values()];
  }

  if (aktion === 'aufnahme' && m) {
    if (req.method === 'GET') {
      const datei = m.aufnahme && (await aufnahmeLaden(m.aufnahme.id));
      if (!m.aufnahme || !datei) return json({ fehler: 'Keine Aufnahme vorhanden' }, 404);
      return new Response(datei, {
        headers: { 'content-type': m.aufnahme.typ, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
      });
    }
    if (!telefon) return verboten();
    if (req.method === 'POST') {
      const typ = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!AUFNAHME_TYPEN.includes(typ)) return json({ fehler: 'Bitte eine Audiodatei (WebM, OGG, M4A, MP3, WAV) senden' }, 400);
      const daten = await req.arrayBuffer();
      if (!daten.byteLength) return json({ fehler: 'Die Aufnahme ist leer' }, 400);
      if (daten.byteLength > AUFNAHME_MAX_BYTES) return json({ fehler: 'Die Aufnahme ist zu groß (höchstens 5,5 MB, etwa 30 Minuten)' }, 400);
      if (!aufnahmeSignaturPasst(new Uint8Array(daten.slice(0, 16)), typ)) return json({ fehler: 'Der Inhalt passt nicht zum Dateityp' }, 400);
      const neu = { id: neueId(), typ, groesse: daten.byteLength, am: Date.now(), von: ich };
      await aufnahmeSpeichern(neu.id, daten, typ);
      if (m.aufnahme) await aufnahmeLoeschen(m.aufnahme.id);
      await speichern({ ...m, aufnahme: neu });
    } else if (req.method === 'DELETE') {
      if (m.aufnahme) await aufnahmeLoeschen(m.aufnahme.id);
      const { aufnahme: _a, ...ohne } = m;
      await speichern(ohne);
    }
  } else if (req.method === 'POST' && !aktion) {
    if (!telefon) return verboten();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { felder, fehler } = eingabePruefen(b);
    if (fehler) return json({ fehler }, 400);
    const neu = { ...felder, id: neueId(), erstellt: Date.now(), von: ich, ...(a.sitzung.name ? { vonName: a.sitzung.name } : {}), status: 'offen' } as Mitschrift;
    if (neu.fall && !liste.some((x) => x.id === neu.fall && x.art === 'sterbefall')) delete neu.fall;
    if (b.uebergeben === true && neu.art === 'sterbefall') Object.assign(neu, { status: 'uebergeben', uebergabe: { am: Date.now(), von: ich, an: await bereitschaftJetzt() } });
    await speichern(neu);
    return antwort(neu.id);
  } else if (req.method === 'PUT' && m) {
    if (!telefon) return verboten();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { felder, fehler } = eingabePruefen({ ...b, art: m.art });
    if (fehler) return json({ fehler }, 400);
    const neu = { ...m, ...felder, geaendert: { am: Date.now(), von: ich } } as Mitschrift;
    for (const k of ['geburtsdatum', 'ortNotiz', 'hausarzt', 'polizei', 'fall'] as const) if (felder[k] === undefined) delete neu[k];
    await speichern(neu);
  } else if (req.method === 'POST' && m && aktion === 'uebergeben') {
    if (!telefon) return verboten();
    if (m.art !== 'sterbefall' || !istOffen(m)) return json({ fehler: 'Nur offene Sterbefälle können übergeben werden' }, 400);
    await speichern({ ...m, status: 'uebergeben', uebergabe: { am: Date.now(), von: ich, an: await bereitschaftJetzt() } });
  } else if (req.method === 'POST' && m && aktion === 'abholung') {
    if (m.art !== 'sterbefall' || !istOffen(m)) return json({ fehler: 'Diese Abholung ist schon abgeschlossen' }, 400);
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const kuehlraum = text(b.kuehlraum, 80);
    if (!kuehlraum) return json({ fehler: 'Bitte den Kühlraum eintragen' }, 400);
    const notiz = text(b.notiz, 1000);
    await speichern({ ...nachtragen(m, b), status: 'abgeschlossen', abholung: { am: Date.now(), von: ich, kuehlraum, ...(notiz ? { notiz } : {}) } });
  } else if (req.method === 'POST' && m && aktion === 'erledigt') {
    if (!telefon) return verboten();
    if (m.art !== 'anliegen') return json({ fehler: 'Nur Anliegen können erledigt werden' }, 400);
    await speichern({ ...m, status: m.status === 'erledigt' ? 'offen' : 'erledigt', geaendert: { am: Date.now(), von: ich } });
  } else if (req.method === 'DELETE' && m) {
    if (!a.rechte.admin) return verboten();
    if (m.aufnahme) await aufnahmeLoeschen(m.aufnahme.id);
    await mitschriftLoeschen(m.id);
    liste = liste.filter((x) => x.id !== m.id);
  } else if (req.method !== 'GET') return json({ fehler: 'Unbekannte Aktion' }, 400);

  return antwort();

  async function antwort(neu?: string) {
    return json({
      mitschriften: liste.filter(sichtbar),
      darfTelefon: telefon,
      darfAbholen: abholen,
      admin: a!.rechte.admin,
      bereitschaft: await bereitschaftJetzt(),
      kuehlraeume: [...new Set(liste.flatMap((x) => (x.abholung ? [x.abholung.kuehlraum] : [])))].slice(0, 12),
      ich: { email: ich, name: a!.sitzung.name },
      telefonJetzt: await telefonJetztLaden().catch(() => null),
      ...(neu ? { neu } : {}),
    });
  }
};

export const config: Config = { path: '/api/telefon', method: ['GET', 'POST', 'PUT', 'DELETE'] };
