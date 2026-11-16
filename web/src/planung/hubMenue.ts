import { useEffect, useRef, useState } from 'react';
import { HUB_HERKUNFT } from './theme';

/** Eintrag des eigenen Seitenmenüs, den der Hub in sein Hauptmenü übernimmt. */
export interface MenuePunkt {
  id: string;
  label: string;
  icon: string;
  zahl?: number;
  warn?: boolean;
}

/**
 * Eingebettet im Hub: Seitenmenü an den Hub melden („hub-menue“). Bestätigt der Hub, dass er es in seinem
 * Hauptmenü zeigt („hub-menue-ok“, an = true), liefert der Hook true und die App blendet ihr eigenes Menü aus.
 * Ein Klick im Hub kommt als „hub-menue-wahl“ zurück.
 */
export function useHubMenue(punkte: MenuePunkt[], aktiv: string | null, onWahl: (id: string) => void): boolean {
  const eingebettet = typeof window !== 'undefined' && window.parent !== window;
  const [an, setAn] = useState(false);
  const wahl = useRef(onWahl);
  wahl.current = onWahl;
  const ids = useRef(new Set<string>());
  ids.current = new Set(punkte.map((p) => p.id));

  useEffect(() => {
    if (!eingebettet) return;
    const nachricht = (e: MessageEvent) => {
      if (e.origin !== HUB_HERKUNFT || e.source !== window.parent) return;
      const d = e.data as { typ?: string; an?: unknown; id?: unknown } | null;
      if (d?.typ === 'hub-menue-ok') setAn(d.an === true);
      if (d?.typ === 'hub-menue-wahl' && typeof d.id === 'string' && ids.current.has(d.id)) wahl.current(d.id);
    };
    window.addEventListener('message', nachricht);
    return () => {
      window.removeEventListener('message', nachricht);
      window.parent.postMessage({ typ: 'hub-menue', punkte: [], aktiv: null }, HUB_HERKUNFT);
    };
  }, [eingebettet]);

  const stand = JSON.stringify([punkte, aktiv]);
  useEffect(() => {
    if (!eingebettet) return;
    window.parent.postMessage({ typ: 'hub-menue', punkte, aktiv }, HUB_HERKUNFT);
    if (!punkte.length) setAn(false);
  }, [eingebettet, stand]); // eslint-disable-line react-hooks/exhaustive-deps

  return eingebettet && an && punkte.length > 0;
}
