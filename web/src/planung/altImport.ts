import { strFromU8, unzipSync } from 'fflate';
import { excelDatum } from '../shared/altImport';

export interface ExcelPerson {
  name: string;
  tage: { datum: string; code: string }[];
}

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const spalteNr = (ref: string) => [...(/^[A-Z]+/.exec(ref)?.[0] ?? '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

/** Blatt „MA Eingaben“ des Excel-An-/Abwesenheitsplaners (.xlsx/.xlsm) lesen: Name und Tageskürzel je Mitarbeiter. */
export async function excelLesen(f: File): Promise<{ jahr: number; personen: ExcelPerson[] }> {
  let z: Record<string, Uint8Array>;
  try {
    z = unzipSync(new Uint8Array(await f.arrayBuffer()));
  } catch {
    throw new Error('Die Datei ist keine Excel-Datei (.xlsx/.xlsm).');
  }
  const lies = (p: string) => (z[p] ? strFromU8(z[p]) : '');
  const blatt = [...xml(lies('xl/workbook.xml')).getElementsByTagName('sheet')].find((s) => s.getAttribute('name')?.trim() === 'MA Eingaben');
  if (!blatt) throw new Error('Blatt „MA Eingaben“ nicht gefunden – ist das der An-/Abwesenheitsplaner?');
  const rid = blatt.getAttribute('r:id');
  const ziel = [...xml(lies('xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target') ?? '';
  const pfad = ziel.startsWith('/') ? ziel.slice(1) : `xl/${ziel.replace(/^\.\//, '')}`;
  const texte = [...xml(lies('xl/sharedStrings.xml')).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''));
  const zeilen = new Map<number, Map<number, string>>();
  for (const c of xml(lies(pfad)).getElementsByTagName('c')) {
    const ref = c.getAttribute('r') ?? '';
    const t = c.getAttribute('t');
    const v = t === 'inlineStr' ? (c.textContent ?? '') : (c.getElementsByTagName('v')[0]?.textContent ?? '');
    if (!v.trim()) continue;
    const zeile = parseInt(ref.replace(/^[A-Z]+/, ''), 10);
    if (!zeilen.has(zeile)) zeilen.set(zeile, new Map());
    zeilen.get(zeile)!.set(spalteNr(ref), t === 's' ? (texte[+v] ?? '') : v);
  }
  const nr = [...zeilen.keys()].sort((a, b) => a - b);
  const wt = nr.find((r) => zeilen.get(r)!.get(6)?.trim().startsWith('Wochentag'));
  const kopf = nr.find((r) => zeilen.get(r)!.get(3)?.trim().startsWith('Name'));
  if (wt == null || kopf == null) throw new Error('Datums- oder Namenszeile im Blatt „MA Eingaben“ nicht gefunden.');
  const spalten = new Map<number, string>();
  for (const [sp, w] of zeilen.get(wt)!) if (sp >= 7 && /^\d+(\.\d+)?$/.test(w)) spalten.set(sp, excelDatum(+w));
  const personen: ExcelPerson[] = [];
  for (const r of nr.filter((x) => x > kopf)) {
    const z2 = zeilen.get(r)!;
    const name = z2.get(3)?.trim();
    if (!name) continue;
    const tage = [...spalten].flatMap(([sp, datum]) => {
      const code = z2.get(sp)?.trim();
      return code ? [{ datum, code }] : [];
    });
    personen.push({ name, tage });
  }
  const erstes = [...spalten.values()].sort()[0];
  return { jahr: erstes ? +erstes.slice(0, 4) : new Date().getFullYear(), personen };
}

/** Text eines PDFs zeilenweise (nach Höhe gruppiert, links → rechts). */
export async function pdfZeilen(f: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  const zeilen: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const items = (await (await doc.getPage(i)).getTextContent()).items
      .flatMap((it) => ('str' in it && it.str.trim() ? [{ x: it.transform[4] as number, y: it.transform[5] as number, s: it.str }] : []))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let gruppe: typeof items = [];
    const fertig = () => gruppe.length && zeilen.push(gruppe.sort((a, b) => a.x - b.x).map((x) => x.s).join(' '));
    for (const it of items) {
      if (gruppe.length && Math.abs(gruppe[0].y - it.y) > 3) {
        fertig();
        gruppe = [];
      }
      gruppe.push(it);
    }
    fertig();
  }
  return zeilen;
}
