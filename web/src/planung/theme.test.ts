import { describe, expect, it } from 'vitest';
import { stimmungCss, stimmungPruefen } from './theme';

describe('Farbstimmung aus dem Hub', () => {
  it('übernimmt nur erlaubte Variablen mit harmlosen Werten', () => {
    const s = stimmungPruefen({ basis: 'dunkel', farben: { '--akzent': '#7fb069', '--bg': 'red;} body{display:none', '--x': '#fff' } });
    expect(s).toEqual({ basis: 'dunkel', farben: { '--akzent': '#7fb069' } });
  });
  it('übernimmt Oberfläche (Textur, Rundung, Schatten, Titelschrift)', () => {
    const farben = {
      '--bg-verlauf': 'repeating-linear-gradient(60deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 22px), radial-gradient(1200px 600px at 10% -10%, #b0122b26, transparent 60%)',
      '--flaeche-textur': 'linear-gradient(180deg, #b0122b14, transparent 40%)',
      '--radius': '2px',
      '--schatten': '0 0 0 1px rgba(0, 0, 0, 0.8), 0 24px 60px -20px rgba(0, 0, 0, 0.9)',
      '--schrift-titel': 'Georgia, Times New Roman, serif',
    };
    const s = stimmungPruefen({ basis: 'dunkel', farben });
    expect(s?.farben).toEqual(farben);
    expect(stimmungCss(s)).toContain('font-family: var(--schrift-titel)');
  });
  it('erzeugt die Textur aus dem Namen (Hub überträgt kein SVG)', () => {
    const s = stimmungPruefen({ basis: 'dunkel', oberflaeche: 'marmor', farben: { '--akzent': '#e0b45c', '--bg-verlauf': 'radial-gradient(1200px 600px at 10% -10%, #e0b45c26, transparent 60%)' } });
    expect(s?.oberflaeche).toBe('marmor');
    const css = stimmungCss(s);
    expect(css).toContain('--bg-verlauf: radial-gradient');
    expect(css).not.toContain('--bg-verlauf: url(');
    expect(css).toMatch(/--flaeche-textur: url\("data:image\/svg\+xml,/);
    expect(stimmungPruefen({ basis: 'dunkel', oberflaeche: 'url(x)', farben: { '--akzent': '#fff' } })?.oberflaeche).toBeUndefined();
  });
  it('lehnt Unbrauchbares ab', () => {
    expect(stimmungPruefen(null)).toBeNull();
    expect(stimmungPruefen({ basis: 'bunt', farben: { '--akzent': '#fff' } })).toBeNull();
    expect(stimmungPruefen({ basis: 'hell', farben: {} })).toBeNull();
  });
  it('CSS greift nur beim passenden Hell/Dunkel', () => {
    const css = stimmungCss({ basis: 'hell', farben: { '--bg': '#f3f5f8', '--akzent': '#2563eb' } });
    expect(css).toContain('html .planung.planung.theme-hell { --bg: #f3f5f8; --akzent: #2563eb; }');
    expect(css).toContain('body:has(.planung.theme-hell) { background: #f3f5f8; }');
    expect(stimmungCss(null)).toBe('');
  });
});
