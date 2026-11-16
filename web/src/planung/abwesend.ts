import { useEffect, useState } from 'react';
import { abwesendIn, abwesendText, letzterTag, type Abwesenheit } from '../shared/abwesenheit';
import { abwesenheitLaden } from './api';

export type AbwEintrag = Abwesenheit & { verdeckt?: boolean };

let cache: { zeit: number; liste: Promise<AbwEintrag[]> } | null = null;

function laden(): Promise<AbwEintrag[]> {
  if (!cache || Date.now() - cache.zeit > 60_000) {
    const liste = abwesenheitLaden()
      .then((d) => d.eintraege as AbwEintrag[])
      .catch(() => {
        cache = null;
        return [];
      });
    cache = { zeit: Date.now(), liste };
  }
  return cache.liste;
}

/** Urlaub, Krankenstand usw. für die Personalauswahl (Fehler beim Laden: leere Liste, die Auswahl bleibt bedienbar). */
export function useAbwesenheiten(aktiv = true): AbwEintrag[] {
  const [l, setL] = useState<AbwEintrag[]>([]);
  useEffect(() => {
    if (!aktiv) return;
    let weg = false;
    void laden().then((x) => !weg && setL(x));
    return () => {
      weg = true;
    };
  }, [aktiv]);
  return l;
}

/** Text wie „🌴 Urlaub bis 7.11.“, wenn die Person im Zeitraum (Tage oder Zeitpunkte YYYY-MM-DDTHH:mm, Ende exklusiv) abwesend ist. */
export function abwesendFuer(l: readonly AbwEintrag[], email: string, von: string, bis: string): string | undefined {
  if (!l.length || !email || !von) return undefined;
  const ende = bis.length > 10 ? letzterTag(bis) : bis || von.slice(0, 10);
  const a = abwesendIn(l, email, von.slice(0, 10), ende < von.slice(0, 10) ? von.slice(0, 10) : ende);
  return a && abwesendText(a);
}
