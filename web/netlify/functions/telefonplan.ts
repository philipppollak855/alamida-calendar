import type { Config } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import { darfPlanen, datumText, plusTage } from '../../src/shared/bereitschaft';
import { hatRolle, mitRolle, rolleVergeben } from '../../src/shared/rollen';
import { musterAus, telEintragFehler, telefonJetzt, type TelEinsatz } from '../../src/shared/telefonplan';
import { ortszeit } from '../../src/shared/heute';
import { angemeldet, json, telMusterLaden, telMusterSpeichern, telPlanLaden, telPlanLoeschen, telPlanSpeichern } from '../lib/server';

const neueId = () => randomBytes(9).toString('base64url');

/**
 * Telefonbereitschaft. GET ?von=JJJJ-MM-TT; POST eintragen, DELETE ?id= austragen (selbst oder Planer).
 * Muster (nur Planer): POST ?aktion=muster (mit id = ändern), DELETE ?aktion=muster&id=.
 */
export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ fehler: 'nicht angemeldet' }, 401);
  if (!a.rechte.freigeschaltet) return json({ fehler: 'keine Freigabe' }, 403);
  const planer = darfPlanen(a.rechte, a.konfig);
  const ich = a.sitzung.email.toLowerCase();
  const rollen = a.konfig.benutzer.map((b) => ({ email: b.email.toLowerCase(), rollen: b.rollen }));
  const darfEintragen = !rolleVergeben(rollen, 'telefon') || hatRolle(rollen.find((x) => x.email === ich), 'telefon');
  const url = new URL(req.url);
  const aktion = url.searchParams.get('aktion') ?? '';
  const id = url.searchParams.get('id') ?? '';
  const standardAb = datumText(plusTage(new Date(), -7));
  const vonParam = url.searchParams.get('von') ?? '';
  const grenze = datumText(plusTage(new Date(), -400));
  const ab = /^\d{4}-\d{2}-\d{2}$/.test(vonParam) ? (vonParam < grenze ? grenze : vonParam) : standardAb;
  const nameVon = (email: string) => a.konfig.benutzer.find((b) => b.email.toLowerCase() === email)?.name ?? (email === ich ? a.sitzung.name : undefined);

  let liste = await telPlanLaden(ab < standardAb ? ab : standardAb);
  let muster = await telMusterLaden();

  if (aktion === 'muster') {
    if (!planer) return json({ fehler: 'Muster dürfen nur Planer anlegen' }, 403);
    if (req.method === 'POST') {
      const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const mid = typeof b.id === 'string' && muster.some((m) => m.id === b.id) ? b.id : neueId();
      const { muster: neu, fehler } = musterAus(b, mid, muster.filter((m) => m.id !== mid), rollen);
      if (!neu) return json({ fehler }, 400);
      if (!a.konfig.benutzer.some((x) => x.email.toLowerCase() === neu.email)) return json({ fehler: 'Unbekannter Mitarbeiter' }, 400);
      const name = nameVon(neu.email);
      muster = [...muster.filter((m) => m.id !== mid), { ...neu, ...(name ? { name } : {}) }];
      await telMusterSpeichern(muster);
    } else if (req.method === 'DELETE') {
      if (!muster.some((m) => m.id === id)) return json({ fehler: 'Muster nicht gefunden' }, 404);
      muster = muster.filter((m) => m.id !== id);
      await telMusterSpeichern(muster);
    }
  } else if (req.method === 'POST') {
    const b = (await req.json().catch(() => ({}))) as { email?: unknown; von?: unknown; bis?: unknown };
    const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim().toLowerCase() : ich;
    if (email !== ich && !planer) return json({ fehler: 'Du darfst nur dich selbst eintragen' }, 403);
    if (email !== ich && !a.konfig.benutzer.some((x) => x.email.toLowerCase() === email)) return json({ fehler: 'Unbekannter Mitarbeiter' }, 400);
    const neu = { email, von: String(b.von ?? ''), bis: String(b.bis ?? '') };
    const fehler = telEintragFehler(liste, neu, rollen);
    if (fehler) return json({ fehler }, 400);
    const name = nameVon(email);
    const e: TelEinsatz = { id: neueId(), ...neu, ...(name ? { name } : {}), eingetragenVon: ich, erstellt: Date.now() };
    await telPlanSpeichern(e);
    liste = await telPlanLaden(ab < standardAb ? ab : standardAb);
    const konflikt = telEintragFehler(liste.filter((x) => x.id !== e.id), neu, rollen);
    if (konflikt) {
      await telPlanLoeschen(e);
      return json({ fehler: konflikt }, 409);
    }
  } else if (req.method === 'DELETE') {
    const e = liste.find((x) => x.id === id);
    if (!e) return json({ fehler: 'Eintrag nicht gefunden' }, 404);
    if (e.email !== ich && !planer) return json({ fehler: 'Du darfst nur dich selbst austragen' }, 403);
    await telPlanLoeschen(e);
    liste = liste.filter((x) => x.id !== id);
  }

  return json({
    eintraege: liste.filter((e) => e.bis.slice(0, 10) >= ab).map(({ erstellt: _e, eingetragenVon, ...rest }) => (planer ? { ...rest, eingetragenVon } : rest)),
    muster,
    darfPlanen: planer,
    darfEintragen,
    ich: { email: ich, name: a.sitzung.name },
    personen: mitRolle(a.konfig.benutzer, 'telefon').map((x) => ({ email: x.email.toLowerCase(), name: x.name })),
    jetzt: telefonJetzt(liste, muster, ortszeit(new Date())),
  });
};

export const config: Config = { path: '/api/telefonplan', method: ['GET', 'POST', 'DELETE'] };
