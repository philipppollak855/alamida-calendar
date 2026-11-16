/**
 * Oberflächen-Texturen der Farbstimmungen (Granit, Marmor, Rauputz, Holz, Leder …) als SVG-Rauschen.
 * Identische Kopie in alamida-calendar (web/src/planung/texturen.ts): der Hub schickt nur den Namen, jede App erzeugt die Textur selbst.
 */
export const TEXTUREN = [
  'glas',
  'seide',
  'samt',
  'holz',
  'leinen',
  'stein',
  'marmor',
  'rau',
  'schiefer',
  'sand',
  'papier',
  'leder',
  'metall',
  'raster',
  'neon',
  'bubble',
  'weich',
  'pop',
  'gotik',
  'lava',
  'wasser',
  'beton',
  'karbon',
  'kork',
  'terrazzo',
  'patina',
  'frost',
  'blaupause',
  'aquarell',
  'perlmutt',
] as const;
export type Textur = (typeof TEXTUREN)[number];
export const istTextur = (x: unknown): x is Textur => typeof x === 'string' && (TEXTUREN as readonly string[]).includes(x);

export interface TexturEingabe {
  art: Textur;
  basis: 'hell' | 'dunkel';
  akzent: string;
  akzent2: string;
  /** Eigene Texturfarbe (Design-Baukasten), sonst Akzent bzw. Hell/Dunkel. */
  farbe?: string;
  /** Stärke 0–2 (1 = normal). */
  staerke?: number;
}

type Rgb = [number, number, number];
const rgb = (hex: string, ersatz: Rgb): Rgb => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : ersatz;
};
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const css = (c: Rgb, a: number) => `rgba(${c.map((x) => Math.round(x * 255)).join(', ')}, ${a})`;

/** Kachel als Daten-URL (nahtlos durch stitchTiles). */
const svg = (g: number, inhalt: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${g}' height='${g}'>${inhalt}</svg>`)}")`;

let lfd = 0;
/** Rauschschicht: Farbe c, Deckkraft = a·Rot + b (aus dem Rauschen). */
const rauschen = (o: { typ?: 'fractalNoise' | 'turbulence'; bf: string; okt: number; seed?: number; c: Rgb; a: number; b: number; licht?: number }) => {
  const id = `f${lfd++}`;
  const licht =
    o.licht != null ? `<feDiffuseLighting lighting-color='#fff' surfaceScale='${o.licht}'><feDistantLight azimuth='45' elevation='60'/></feDiffuseLighting>` : '';
  const [r, g, b] = o.c;
  return (
    `<filter id='${id}' x='0' y='0' width='100%' height='100%'>` +
    `<feTurbulence type='${o.typ ?? 'fractalNoise'}' baseFrequency='${o.bf}' numOctaves='${o.okt}' seed='${o.seed ?? 2}' stitchTiles='stitch'/>${licht}` +
    `<feColorMatrix values='0 0 0 0 ${r3(r)} 0 0 0 0 ${r3(g)} 0 0 0 0 ${r3(b)} ${r3(o.a)} 0 0 0 ${r3(o.b)}'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#${id})'/>`
  );
};

/** Relief (Licht von links oben): Schatten werden sichtbar, flache Stellen bleiben frei. */
const relief = (bf: string, okt: number, hoehe: number, c: Rgb, s: number, seed = 2) => rauschen({ bf, okt, seed, c, licht: hoehe, a: -1.8 * s, b: 1.55 * s });

/** Texturschichten für Seite und Karten (Karten gedämpft und mit Lesbarkeits-Schleier). */
export function textur(e: TexturEingabe): { seite: string; flaeche: string; mobil: string } {
  const dunkel = e.basis === 'dunkel';
  const eigen = e.farbe ? rgb(e.farbe, [0.5, 0.5, 0.5]) : null;
  const tinte: Rgb = eigen ?? (dunkel ? [1, 1, 1] : [0, 0, 0]);
  const schatten: Rgb = [0, 0, 0];
  const weiss: Rgb = [1, 1, 1];
  const ak = eigen ?? rgb(e.akzent, tinte);
  const ak2 = eigen ?? rgb(e.akzent2, tinte);
  const k = (dunkel ? 1 : 0.8) * Math.min(2, Math.max(0, e.staerke ?? 1));
  const schicht = (s: number): string => {
    lfd = 0;
    switch (e.art) {
      case 'stein':
        return svg(
          320,
          rauschen({ bf: '0.012', okt: 3, c: tinte, a: 0.55 * s, b: -0.16 * s }) +
            rauschen({ bf: '0.9', okt: 3, seed: 5, c: tinte, a: 4 * s, b: -2.45 * s }) +
            rauschen({ bf: '0.7', okt: 2, seed: 8, c: schatten, a: 3.5 * s, b: -2.1 * s }),
        );
      case 'marmor':
        return svg(
          640,
          rauschen({ bf: '0.006', okt: 3, c: tinte, a: 0.35 * s, b: -0.08 * s }) +
            rauschen({ typ: 'turbulence', bf: '0.0035 0.008', okt: 5, seed: 3, c: ak, a: -7 * s, b: 0.75 * s }) +
            rauschen({ typ: 'turbulence', bf: '0.006 0.012', okt: 4, seed: 11, c: tinte, a: -9 * s, b: 0.45 * s }),
        );
      case 'rau':
        return svg(256, relief('0.42', 4, 2.5, schatten, 0.7 * s) + rauschen({ bf: '0.02', okt: 3, seed: 6, c: tinte, a: 0.3 * s, b: -0.08 * s }));
      case 'leder':
        return svg(300, relief('0.06', 3, 4, schatten, 0.9 * s, 7) + rauschen({ bf: '0.9', okt: 2, seed: 4, c: tinte, a: 0.25 * s, b: -0.08 * s }));
      case 'schiefer':
        return svg(
          480,
          rauschen({ bf: '0.003 0.035', okt: 4, c: tinte, a: 0.7 * s, b: -0.26 * s }) +
            rauschen({ typ: 'turbulence', bf: '0.002 0.06', okt: 2, seed: 9, c: schatten, a: -2.5 * s, b: 0.28 * s }) +
            rauschen({ bf: '0.8', okt: 2, seed: 5, c: tinte, a: 0.5 * s, b: -0.2 * s }),
        );
      case 'sand':
        return svg(
          300,
          rauschen({ typ: 'turbulence', bf: '0.003 0.035', okt: 2, seed: 4, c: tinte, a: -1.6 * s, b: 0.28 * s }) +
            rauschen({ bf: '1.3', okt: 2, seed: 2, c: schatten, a: 3.4 * s, b: -1.95 * s }) +
            rauschen({ bf: '1.1', okt: 2, seed: 7, c: ak, a: 2.6 * s, b: -1.48 * s }),
        );
      case 'holz':
        return svg(
          480,
          rauschen({ bf: '0.0025 0.09', okt: 3, c: tinte, a: 0.8 * s, b: -0.32 * s }) +
            rauschen({ typ: 'turbulence', bf: '0.006 0.22', okt: 2, seed: 9, c: schatten, a: -1.6 * s, b: 0.4 * s }),
        );
      case 'metall':
        return (
          `linear-gradient(180deg, ${css(tinte, 0.09 * s)}, transparent 45%, ${css(tinte, 0.05 * s)} 80%, transparent), ` +
          svg(300, rauschen({ bf: '0.0012 0.9', okt: 2, c: tinte, a: 1 * s, b: -0.36 * s }) + rauschen({ bf: '0.002 0.6', okt: 2, seed: 6, c: schatten, a: 0.8 * s, b: -0.3 * s }))
        );
      case 'leinen':
        return svg(
          240,
          rauschen({ typ: 'turbulence', bf: '1.2 0.035', okt: 2, c: tinte, a: 0.55 * s, b: -0.12 * s }) +
            rauschen({ typ: 'turbulence', bf: '0.035 1.2', okt: 2, seed: 5, c: schatten, a: 0.45 * s, b: -0.1 * s }),
        );
      case 'papier':
        return svg(
          300,
          rauschen({ bf: '0.8', okt: 4, c: schatten, a: 0.5 * s, b: -0.16 * s }) +
            rauschen({ typ: 'turbulence', bf: '0.012 0.1', okt: 2, seed: 7, c: tinte, a: -1.2 * s, b: 0.14 * s }),
        );
      case 'samt':
        return (
          `radial-gradient(130% 90% at 50% -10%, ${css(tinte, 0.08 * s)}, transparent 65%), ` +
          svg(200, rauschen({ bf: '1.1', okt: 2, c: tinte, a: 0.4 * s, b: -0.1 * s }) + rauschen({ bf: '0.008', okt: 3, seed: 4, c: schatten, a: 0.6 * s, b: -0.18 * s }))
        );
      case 'seide':
        return (
          `linear-gradient(115deg, transparent 25%, ${css(tinte, 0.08 * s)} 45%, transparent 65%), ` +
          svg(600, rauschen({ typ: 'turbulence', bf: '0.0015 0.01', okt: 2, seed: 4, c: tinte, a: 0.5 * s, b: -0.06 * s }))
        );
      case 'weich':
        return svg(600, rauschen({ bf: '0.004', okt: 4, c: dunkel ? tinte : [1, 1, 1], a: 0.9 * s, b: -0.3 * s }) + rauschen({ bf: '0.006', okt: 3, seed: 9, c: ak, a: 0.4 * s, b: -0.14 * s }));
      case 'lava':
        return svg(
          420,
          relief('0.08', 4, 3, schatten, s, 3) + rauschen({ typ: 'turbulence', bf: '0.005 0.007', okt: 4, seed: 5, c: ak, a: -9 * s, b: 0.95 * s }),
        );
      case 'wasser':
        return svg(
          480,
          rauschen({ typ: 'turbulence', bf: '0.007', okt: 2, seed: 9, c: ak, a: -6 * s, b: 0.5 * s }) +
            rauschen({ typ: 'turbulence', bf: '0.011', okt: 2, seed: 3, c: ak2, a: -6 * s, b: 0.3 * s }) +
            rauschen({ bf: '0.003 0.01', okt: 2, c: tinte, a: 0.4 * s, b: -0.14 * s }),
        );
      case 'gotik':
        return (
          `radial-gradient(80% 50% at 50% 110%, ${css(ak, 0.16 * s)}, transparent 70%), ` +
          `repeating-linear-gradient(60deg, ${css(tinte, 0.05 * s)} 0 1px, transparent 1px 26px), repeating-linear-gradient(-60deg, ${css(tinte, 0.05 * s)} 0 1px, transparent 1px 26px), ` +
          svg(320, relief('0.12', 4, 2, schatten, 0.9 * s, 4) + rauschen({ bf: '0.01', okt: 3, c: tinte, a: 0.35 * s, b: -0.1 * s }))
        );
      case 'neon':
        return (
          `repeating-linear-gradient(0deg, ${css(tinte, 0.045 * s)} 0 1px, transparent 1px 3px), ` +
          `radial-gradient(70% 50% at 50% 0%, ${css(ak, 0.1 * s)}, transparent 70%), ` +
          svg(200, rauschen({ bf: '0.9', okt: 1, c: ak, a: 1.6 * s, b: -0.9 * s }))
        );
      case 'raster':
        return (
          `repeating-linear-gradient(0deg, ${css(ak, 0.14 * s)} 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, ${css(ak, 0.14 * s)} 0 1px, transparent 1px 28px), ` +
          `linear-gradient(180deg, transparent 55%, ${css(ak2, 0.08 * s)})`
        );
      case 'bubble': {
        const kreise = [
          [40, 50, 26],
          [150, 30, 14],
          [230, 110, 34],
          [90, 160, 20],
          [190, 220, 12],
          [30, 250, 18],
          [270, 270, 9],
        ]
          .map(([x, y, r], i) => {
            const c = i % 2 ? ak2 : ak;
            return `<circle cx='${x}' cy='${y}' r='${r}' fill='${css(c, 0.07 * s)}' stroke='${css(c, 0.22 * s)}' stroke-width='1.5'/><circle cx='${x - r / 3}' cy='${y - r / 3}' r='${r / 4}' fill='${css([1, 1, 1], 0.25 * s)}'/>`;
          })
          .join('');
        return svg(300, kreise);
      }
      case 'pop':
        return (
          svg(
            16,
            `<circle cx='4' cy='4' r='2.4' fill='${css(ak2, 0.2 * s)}'/><circle cx='12' cy='12' r='2.4' fill='${css(ak2, 0.2 * s)}'/>`,
          ) + `, linear-gradient(135deg, ${css(ak, 0.06 * s)}, transparent 50%)`
        );
      case 'beton':
        return svg(
          300,
          rauschen({ bf: '0.02', okt: 4, c: tinte, a: 0.6 * s, b: -0.2 * s }) +
            rauschen({ bf: '0.6', okt: 2, seed: 9, c: schatten, a: 2.2 * s, b: -1.5 * s }) +
            rauschen({ bf: '0.25', okt: 1, seed: 4, c: schatten, a: 6 * s, b: -4.6 * s }),
        );
      case 'karbon':
        return (
          `repeating-linear-gradient(45deg, ${css(tinte, 0.07 * s)} 0 3px, transparent 3px 6px), repeating-linear-gradient(-45deg, ${css(schatten, 0.25 * s)} 0 3px, transparent 3px 6px), ` +
          `linear-gradient(180deg, ${css(tinte, 0.06 * s)}, transparent 60%)`
        );
      case 'kork':
        return svg(220, rauschen({ bf: '0.35', okt: 3, seed: 7, c: ak, a: 3 * s, b: -1.7 * s }) + rauschen({ bf: '0.8', okt: 2, seed: 3, c: schatten, a: 3.5 * s, b: -2.4 * s }));
      case 'terrazzo':
        return svg(
          260,
          rauschen({ bf: '0.05', okt: 2, seed: 12, c: ak, a: 9 * s, b: -6.3 * s }) +
            rauschen({ bf: '0.07', okt: 2, seed: 21, c: ak2, a: 9 * s, b: -6.6 * s }) +
            rauschen({ bf: '0.09', okt: 1, seed: 5, c: schatten, a: 8 * s, b: -6.4 * s }),
        );
      case 'patina':
        return svg(400, rauschen({ typ: 'turbulence', bf: '0.012', okt: 4, seed: 6, c: ak, a: 1.6 * s, b: -0.5 * s }) + relief('0.08', 3, 1.5, schatten, 0.6 * s, 9));
      case 'frost':
        return (
          `linear-gradient(160deg, ${css(weiss, 0.14 * s)}, transparent 50%), ` +
          svg(360, rauschen({ typ: 'turbulence', bf: '0.03 0.01', okt: 3, seed: 14, c: weiss, a: -4 * s, b: 1 * s }))
        );
      case 'blaupause':
        return (
          `repeating-linear-gradient(0deg, ${css(ak, 0.2 * s)} 0 1px, transparent 1px 60px), repeating-linear-gradient(90deg, ${css(ak, 0.2 * s)} 0 1px, transparent 1px 60px), ` +
          `repeating-linear-gradient(0deg, ${css(ak, 0.07 * s)} 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, ${css(ak, 0.07 * s)} 0 1px, transparent 1px 12px)`
        );
      case 'aquarell':
        return svg(600, rauschen({ bf: '0.004', okt: 4, seed: 8, c: ak, a: 1.2 * s, b: -0.45 * s }) + rauschen({ bf: '0.006', okt: 3, seed: 17, c: ak2, a: 1.2 * s, b: -0.5 * s }));
      case 'perlmutt':
        return (
          `linear-gradient(120deg, ${css(ak, 0.1 * s)}, transparent 30%, ${css(ak2, 0.1 * s)} 55%, transparent 80%), ` +
          svg(400, rauschen({ typ: 'turbulence', bf: '0.006 0.02', okt: 3, seed: 5, c: weiss, a: -3 * s, b: 0.6 * s }))
        );
      case 'glas':
      default:
        return `linear-gradient(135deg, ${css(tinte, 0.1 * s)}, transparent 35%), linear-gradient(315deg, ${css(ak, 0.06 * s)}, transparent 40%)`;
    }
  };
  // Karten/Seitenleiste: Textur gedämpft, darüber ein Schleier in Grundhelligkeit für lesbaren Text.
  const schleier = dunkel ? 'rgba(0, 0, 0, 0.24)' : 'rgba(255, 255, 255, 0.38)';
  // Handy: kleine Karten zeigen nur einen Ausschnitt der Kachel, daher kräftiger und mit leichterem Schleier.
  const schleierMobil = dunkel ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.24)';
  return {
    seite: schicht(k),
    flaeche: `linear-gradient(${schleier}, ${schleier}), ${schicht(0.38 * k)}`,
    mobil: `linear-gradient(${schleierMobil}, ${schleierMobil}), ${schicht(0.7 * k)}`,
  };
}
