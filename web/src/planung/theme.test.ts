import { describe, expect, it } from 'vitest';
import { stimmungCss, stimmungPruefen } from './theme';

describe('Farbstimmung aus dem Hub', () => {
  it('übernimmt nur erlaubte Variablen mit harmlosen Werten', () => {
    const s = stimmungPruefen({ basis: 'dunkel', farben: { '--akzent': '#7fb069', '--bg': 'red;} body{display:none', '--x': '#fff' } });
    expect(s).toEqual({ basis: 'dunkel', farben: { '--akzent': '#7fb069' } });
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
