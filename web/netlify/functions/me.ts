import type { Config } from '@netlify/functions';
import { angemeldet, json } from '../lib/server';
import { KATEGORIE_SCHLUESSEL } from '../../src/shared/rechte';
import { darfAnlegen, standardDauer } from '../../src/shared/neuerTermin';

export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ angemeldet: false });
  const { sitzung, rechte, konfig } = a;
  return json({
    angemeldet: true,
    benutzer: { email: sitzung.email, name: sitzung.name, bild: sitzung.bild },
    rechte,
    ...(sitzung.kiosk ? { kiosk: true } : {}),
    gruppenNamen: konfig.gruppen.filter((g) => rechte.gruppen.includes(g.id)).map((g) => g.name),
    anlegen: darfAnlegen(rechte, konfig) ? { darf: true, dauer: Object.fromEntries(KATEGORIE_SCHLUESSEL.map((k) => [k, standardDauer(konfig, k)])) } : { darf: false, dauer: {} },
  });
};

export const config: Config = { path: '/api/me' };
