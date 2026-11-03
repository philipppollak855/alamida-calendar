import { useCallback, useEffect, useRef, useState } from 'react';

/** Hell/Dunkel, app-übergreifend: der Hub gibt das Design per #theme=… und postMessage vor, Änderungen gehen an den Hub zurück. */
export type Theme = 'dunkel' | 'hell';
const LS_THEME = 'alamida.theme';
const HUB_HERKUNFT = 'https://bestattung-stranz-hub.netlify.app';
const gueltig = (x: unknown): x is Theme => x === 'hell' || x === 'dunkel';

export function startTheme(): Theme {
  const ausHub = new URLSearchParams(location.hash.slice(1)).get('theme');
  if (gueltig(ausHub)) {
    localStorage.setItem(LS_THEME, ausHub);
    return ausHub;
  }
  return localStorage.getItem(LS_THEME) === 'hell' ? 'hell' : 'dunkel';
}

export function useTheme(): [Theme, (t: Theme | ((alt: Theme) => Theme)) => void] {
  const [theme, setRoh] = useState<Theme>(startTheme);
  const aktuell = useRef(theme);
  aktuell.current = theme;

  useEffect(() => {
    const nachricht = (e: MessageEvent) => {
      const d = e.data as { typ?: string; theme?: unknown } | null;
      if (e.origin === HUB_HERKUNFT && d?.typ === 'hub-theme' && gueltig(d.theme)) setRoh(d.theme);
    };
    const speicher = (e: StorageEvent) => e.key === LS_THEME && gueltig(e.newValue) && setRoh(e.newValue);
    window.addEventListener('message', nachricht);
    window.addEventListener('storage', speicher);
    return () => {
      window.removeEventListener('message', nachricht);
      window.removeEventListener('storage', speicher);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_THEME, theme);
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dunkel' ? '#0b0d12' : '#f6f3ec');
  }, [theme]);

  const setTheme = useCallback((t: Theme | ((alt: Theme) => Theme)) => {
    const neu = typeof t === 'function' ? t(aktuell.current) : t;
    setRoh(neu);
    if (window.parent !== window) window.parent.postMessage({ typ: 'hub-theme', theme: neu }, HUB_HERKUNFT);
  }, []);

  return [theme, setTheme];
}
