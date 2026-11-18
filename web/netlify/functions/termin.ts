import type { Config } from '@netlify/functions';
import { KATEGORIE_SCHLUESSEL, darfSehen } from '../../src/shared/rechte';
import { WEB_QUELLE, darfAnlegen, googleEreignis, neuerTerminPruefen, terminSichtbar, zielKalender, zusatzEigenschaften } from '../../src/shared/neuerTermin';
import { terminTeile } from '../../src/shared/einteilung';
import { KATEGORIEN, kategorieAus, type GoogleEvent } from '../../src/planung/planungLogic';
import { angemeldet, einteilungLoeschen, googleGet, googleSenden, json } from '../lib/server';

/** POST: neuen Termin anlegen (Befähigte). PUT ?id=…[&serie=1]: in der App angelegten Termin (bzw. Titel/Ort/Notiz/Checkliste/Sichtbarkeit der ganzen Serie) ändern (Ersteller oder Admin). DELETE ?id=kalenderId/eventId[&serie=1]: Termin bzw. ganze Serie löschen (Ersteller oder Admin). */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'kein Zugriff' }, 403);
  const ich = a.sitzung.email.toLowerCase();

  const serie = new URL(req.url).searchParams.get('serie') === '1';
  if (req.method === 'PUT') {
    const teile = terminTeile(new URL(req.url).searchParams.get('id') ?? '');
    if (!teile) return json({ fehler: 'Termin fehlt' }, 400);
    const pfad = `/calendars/${encodeURIComponent(teile.kalenderId)}/events/${encodeURIComponent(teile.eventId)}`;
    let ev: GoogleEvent & { colorId?: string };
    try {
      ev = await googleGet<GoogleEvent & { colorId?: string }>(pfad);
    } catch {
      return json({ fehler: 'Termin nicht gefunden' }, 404);
    }
    const alt = ev.extendedProperties?.private ?? {};
    if (!darfSehen(a.rechte, teile.kalenderId, kategorieAus(ev)) || !terminSichtbar(a.rechte, alt)) return json({ fehler: 'Kein Zugriff' }, 403);
    if (alt.quelle !== WEB_QUELLE) return json({ fehler: 'Nur in der App angelegte Termine können hier bearbeitet werden' }, 403);
    if (alt.angelegtVon !== ich && !a.rechte.admin) return json({ fehler: 'Nur wer den Termin angelegt hat oder ein Admin darf ihn bearbeiten' }, 403);
    const p = neuerTerminPruefen(await req.json().catch(() => ({})), KATEGORIE_SCHLUESSEL);
    if ('fehler' in p) return json({ fehler: p.fehler }, 400);
    if (!darfSehen(a.rechte, teile.kalenderId, p.termin.kategorie)) return json({ fehler: 'Keine Berechtigung für diese Kategorie' }, 403);
    const k = KATEGORIEN[p.termin.kategorie as keyof typeof KATEGORIEN];
    const { recurrence: _ohneSerie, ...neu } = googleEreignis(p.termin, k, { email: alt.angelegtVon ?? ich });
    const angelegt = (ev.description ?? '').split('\n\n').find((x) => x.startsWith('Angelegt von '));
    const { checkliste: _c, sichtGruppen: _g, sichtPersonen: _p, ...bleibt } = alt;
    const description = [p.termin.notiz, angelegt, `Geändert von ${a.sitzung.name ?? ich}`].filter(Boolean).join('\n\n');
    // Leere Werte statt weglassen: PATCH behält fehlende Schlüssel, entfernte Gruppen/Personen sollen wirklich weg sein.
    const extendedProperties = { private: { ...bleibt, kategorie: p.termin.kategorie, checkliste: '', sichtGruppen: '', sichtPersonen: '', ...zusatzEigenschaften(p.termin) } };
    const body = { ...neu, description, extendedProperties, ...(ev.colorId ? { colorId: ev.colorId } : {}) };
    try {
      if (serie && ev.recurringEventId) {
        // Ganze Serie: Datum/Uhrzeit bleiben je Termin, nur Inhalt ändert sich.
        const basis = `/calendars/${encodeURIComponent(teile.kalenderId)}/events/${encodeURIComponent(ev.recurringEventId)}`;
        const s = await googleSenden<GoogleEvent>('PATCH', basis, { summary: neu.summary, location: neu.location ?? '', description, extendedProperties });
        return json({ kalender: { id: teile.kalenderId, name: a.konfig.kalender.find((x) => x.id === teile.kalenderId)?.name ?? teile.kalenderId }, event: s, serie: true });
      }
      const event = await googleSenden<GoogleEvent>('PUT', pfad, body);
      return json({ kalender: { id: teile.kalenderId, name: a.konfig.kalender.find((x) => x.id === teile.kalenderId)?.name ?? teile.kalenderId }, event });
    } catch (e) {
      return json({ fehler: `Google Kalender: ${(e as Error).message}` }, 502);
    }
  }

  if (req.method === 'DELETE') {
    const teile = terminTeile(new URL(req.url).searchParams.get('id') ?? '');
    if (!teile) return json({ fehler: 'Termin fehlt' }, 400);
    const pfad = `/calendars/${encodeURIComponent(teile.kalenderId)}/events/${encodeURIComponent(teile.eventId)}`;
    let ev: GoogleEvent;
    try {
      ev = await googleGet<GoogleEvent>(pfad);
    } catch {
      return json({ fehler: 'Termin nicht gefunden' }, 404);
    }
    const p = ev.extendedProperties?.private ?? {};
    if (!darfSehen(a.rechte, teile.kalenderId, kategorieAus(ev)) || !terminSichtbar(a.rechte, p)) return json({ fehler: 'Kein Zugriff' }, 403);
    if (p.quelle !== WEB_QUELLE) return json({ fehler: 'Nur in der App angelegte Termine können hier gelöscht werden' }, 403);
    if (p.angelegtVon !== ich && !a.rechte.admin) return json({ fehler: 'Nur wer den Termin angelegt hat oder ein Admin darf ihn löschen' }, 403);
    if (serie && ev.recurringEventId) {
      await googleSenden('DELETE', `/calendars/${encodeURIComponent(teile.kalenderId)}/events/${encodeURIComponent(ev.recurringEventId)}`);
      return json({ ok: true });
    }
    await googleSenden('DELETE', pfad);
    await einteilungLoeschen(`${teile.kalenderId}/${teile.eventId}`).catch(() => undefined);
    return json({ ok: true });
  }

  if (!darfAnlegen(a.rechte, a.konfig)) return json({ fehler: 'Keine Berechtigung zum Anlegen von Terminen' }, 403);
  const p = neuerTerminPruefen(await req.json().catch(() => ({})), KATEGORIE_SCHLUESSEL);
  if ('fehler' in p) return json({ fehler: p.fehler }, 400);
  const t = p.termin;
  const kalenderId = zielKalender(a.konfig, t.kategorie);
  if (!kalenderId) return json({ fehler: 'Kein Kalender eingestellt (Rechte → Kalender)' }, 400);
  if (!darfSehen(a.rechte, kalenderId, t.kategorie)) return json({ fehler: 'Keine Berechtigung für diese Kategorie bzw. diesen Kalender' }, 403);
  const k = KATEGORIEN[t.kategorie as keyof typeof KATEGORIEN];
  try {
    const event = await googleSenden<GoogleEvent>('POST', `/calendars/${encodeURIComponent(kalenderId)}/events`, googleEreignis(t, k, { email: ich, name: a.sitzung.name }));
    return json({ kalender: { id: kalenderId, name: a.konfig.kalender.find((x) => x.id === kalenderId)?.name ?? kalenderId }, event });
  } catch (e) {
    return json({ fehler: `Google Kalender: ${(e as Error).message}` }, 502);
  }
};

export const config: Config = { path: '/api/termin', method: ['POST', 'PUT', 'DELETE'] };
