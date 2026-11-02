import type { Config } from '@netlify/functions';
import { angemeldet, json } from '../lib/server';

export default async (req: Request) => {
  const a = await angemeldet(req);
  if (!a) return json({ angemeldet: false });
  const { sitzung, rechte, konfig } = a;
  return json({
    angemeldet: true,
    benutzer: { email: sitzung.email, name: sitzung.name, bild: sitzung.bild },
    rechte,
    gruppenNamen: konfig.gruppen.filter((g) => rechte.gruppen.includes(g.id)).map((g) => g.name),
  });
};

export const config: Config = { path: '/api/me' };
