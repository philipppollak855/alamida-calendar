import { useCallback, useEffect, useRef, useState } from 'react';
import { istTextur, textur, type Textur } from './texturen';

/** Hell/Dunkel, app-übergreifend: der Hub gibt das Design per #theme=… und postMessage vor, Änderungen gehen an den Hub zurück. */
export type Theme = 'dunkel' | 'hell';
const LS_THEME = 'alamida.theme';
export const HUB_HERKUNFT = 'https://bestattung-stranz-hub.netlify.app';
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

/** Eingebettet im Hub: Bedienung melden, damit der Hub die Kiosk-Sitzung nicht wegen Untätigkeit beendet. */
if (typeof window !== 'undefined' && window.parent !== window) {
  let zuletzt = 0;
  const melden = () => {
    const jetzt = Date.now();
    if (jetzt - zuletzt < 15_000) return;
    zuletzt = jetzt;
    window.parent.postMessage({ typ: 'hub-aktiv' }, HUB_HERKUNFT);
  };
  for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(t, melden, { passive: true });
}

/** Farbstimmung aus dem Hub: CSS-Variablen für `.planung`, greift nur bei passendem Hell/Dunkel. */
const LS_STIMMUNG = 'alamida.stimmung';
const STIMMUNG_VARS = new Set([
  '--bg',
  '--bg-verlauf',
  '--flaeche',
  '--flaeche-fest',
  '--flaeche-textur',
  '--akzent',
  '--akzent-2',
  '--akzent-text',
  '--radius',
  '--blur',
  '--rand',
  '--rand-stark',
  '--schatten',
  '--schrift-titel',
]);
interface StimmungDaten {
  basis: Theme;
  farben: Record<string, string>;
  /** Textur-Name; die Textur selbst (SVG) wird hier erzeugt, nicht übertragen. */
  oberflaeche?: Textur;
}

export function stimmungPruefen(x: unknown): StimmungDaten | null {
  const o = x as { basis?: unknown; farben?: unknown; oberflaeche?: unknown } | null;
  if (!o || !gueltig(o.basis) || !o.farben || typeof o.farben !== 'object') return null;
  const farben: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.farben as Record<string, unknown>))
    if (STIMMUNG_VARS.has(k) && typeof v === 'string' && v.length <= 1000 && /^[#(),.%\w\s-]+$/.test(v)) farben[k] = v;
  if (!Object.keys(farben).length) return null;
  return istTextur(o.oberflaeche) ? { basis: o.basis, farben, oberflaeche: o.oberflaeche } : { basis: o.basis, farben };
}

export function stimmungCss(s: StimmungDaten | null): string {
  if (!s) return '';
  const w = `html .planung.planung.theme-${s.basis}`;
  const farben = { ...s.farben };
  if (s.oberflaeche) {
    const t = textur({ art: s.oberflaeche, basis: s.basis, akzent: farben['--akzent'] ?? '', akzent2: farben['--akzent-2'] ?? '' });
    farben['--flaeche-textur'] = t.flaeche;
  }
  const vars = Object.entries(farben)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
  return [
    `${w} { ${vars} }`,
    `${w} .knopf.primaer { background: linear-gradient(135deg, var(--akzent-2), var(--akzent)); }`,
    ...(s.farben['--schrift-titel']
      ? [`${w} :is(h1, h2, h3, .kachel-wert, .kachel-titel, .marke-name, .wb-datum, .m-uhr, .rbc-toolbar-label) { font-family: var(--schrift-titel); }`]
      : []),
    ...(s.farben['--bg'] ? [`body:has(.planung.theme-${s.basis}) { background: ${s.farben['--bg']}; }`] : []),
  ].join('\n');
}

function stimmungAnwenden(s: StimmungDaten | null) {
  let el = document.getElementById('alamida-stimmung');
  if (!el) {
    el = document.createElement('style');
    el.id = 'alamida-stimmung';
    document.head.appendChild(el);
  }
  el.textContent = stimmungCss(s);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    stimmungAnwenden(stimmungPruefen(JSON.parse(localStorage.getItem(LS_STIMMUNG) ?? 'null')));
  } catch {
    /* nichts gespeichert */
  }
  window.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { typ?: string; stimmung?: unknown } | null;
    if (e.origin !== HUB_HERKUNFT || d?.typ !== 'hub-stimmung') return;
    const s = stimmungPruefen(d.stimmung);
    if (s) localStorage.setItem(LS_STIMMUNG, JSON.stringify(s));
    else localStorage.removeItem(LS_STIMMUNG);
    stimmungAnwenden(s);
  });
}
