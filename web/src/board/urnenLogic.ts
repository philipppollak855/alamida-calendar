import type { Sterbefall } from '../types';

export function istInUrnenBereich(s: Sterbefall): boolean {
  return s.urnenBereich === true;
}

export type UrnenEintrag = {
  docId: string;
  sterbefallId: string;
  name: string;
  retourVon?: string;
};

export function countUrnen(sterbefaelle: Sterbefall[]): number {
  return sterbefaelle.filter(istInUrnenBereich).length;
}

export function buildUrnenListe(sterbefaelle: Sterbefall[]): UrnenEintrag[] {
  return sterbefaelle
    .filter(istInUrnenBereich)
    .map((s) => ({
      docId: s.id,
      sterbefallId: s.sterbefallId ?? s.id,
      name: s.verstorbenerName ?? s.sterbefallId ?? s.id,
      retourVon: s.retourVon,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
