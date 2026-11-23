import { nachladen } from '../modulNeuLaden';
import {
  BERICHT_SPALTEN,
  berichtHinweis,
  berichtWerte,
  monatText,
  nachtragWerte,
  type BerichtZeile,
  type NachtragZeile,
  type ZeitkontoEinstellungen,
} from '../shared/zeitkonto';
import { briefpapierDatei } from './api';

/** `info`: kleiner Zusatz unter dem Namen im unteren Zellrand, ohne die Zeile zu erhöhen. */
type Tabelle = { gruppe: string; body: string[][]; fett?: boolean[][]; info?: (string | undefined)[] };

/** Ränder wie im alten Programm (Briefpapier: oben 45 mm, Fußzeile des Briefpapiers frei lassen). */
export const PDF_RAND = { links: 15, obenBrief: 52, untenBrief: 48, oben: 20, unten: 15 };

const bildFormat = (b: Uint8Array) => (b[0] === 0x89 && b[1] === 0x50 ? 'PNG' : 'JPEG');

async function aufbauen(titel: string, hinweis: string, tabellen: Tabelle[]): Promise<Blob> {
  const [[{ jsPDF }, { autoTable }], bild] = await Promise.all([
    nachladen(() => Promise.all([import('jspdf'), import('jspdf-autotable')])),
    briefpapierDatei().then((b) => (b ? b.arrayBuffer().then((x) => new Uint8Array(x)) : null)),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rand = PDF_RAND.links;
  const oben = bild ? PDF_RAND.obenBrief : PDF_RAND.oben;
  const unten = bild ? PDF_RAND.untenBrief : PDF_RAND.unten;
  const mitHintergrund = new Set<number>();
  /* Briefpapier wie im Original auf jeder Seite zuerst, der Inhalt liegt darüber. */
  const hintergrund = () => {
    const seite = doc.getNumberOfPages();
    if (!bild || mitHintergrund.has(seite)) return;
    mitHintergrund.add(seite);
    doc.addImage(bild, bildFormat(bild), 0, 0, 210, 297, 'briefpapier', 'FAST');
  };
  hintergrund();
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(titel, rand, oben + 6);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  const hz = doc.splitTextToSize(hinweis, 180) as string[];
  doc.text(hz, rand, oben + 13);
  let y = oben + 17 + hz.length * 4;
  for (const g of tabellen) {
    if (y > 297 - unten - 30) {
      doc.addPage();
      hintergrund();
      y = oben + 4;
    }
    doc.setFillColor(240, 240, 240);
    doc.setDrawColor(0);
    doc.rect(rand, y, 180, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Gruppe: ${g.gruppe}`, rand + 2, y + 5.5);
    autoTable(doc, {
      startY: y + 8,
      margin: { left: rand, right: rand, top: oben, bottom: unten },
      head: [[...BERICHT_SPALTEN]],
      body: g.body,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.3, lineColor: 0, lineWidth: 0.2, textColor: 0, fillColor: [255, 255, 255] },
      headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 52 } },
      willDrawPage: hintergrund,
      didParseCell: (c) => {
        if (c.section === 'body' && g.fett?.[c.row.index]?.[c.column.index]) c.cell.styles.fontStyle = 'bold';
      },
      didDrawCell: (c) => {
        const info = c.section === 'body' && c.column.index === 0 ? g.info?.[c.row.index] : undefined;
        if (!info) return;
        const breite = c.cell.width - 2 * c.cell.padding('left');
        doc.setFont('helvetica', 'italic');
        let gr = 5.5;
        doc.setFontSize(gr);
        while (gr > 4 && doc.getTextWidth(info) > breite) doc.setFontSize((gr -= 0.25));
        doc.setTextColor(90);
        doc.text(info, c.cell.x + c.cell.padding('left'), c.cell.y + c.cell.height - 0.6);
        doc.setTextColor(0);
      },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20) + 12;
  }
  const seiten = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.text(`Erstellt am ${new Date().toLocaleDateString('de-AT')} – Seite ${i}/${seiten}`, rand, 297 - unten + (bild ? 3 : 5));
  }
  return doc.output('blob');
}

/** Monatsbericht als PDF im Aufbau der bisherigen Vorlage (Briefpapier, Titel, Hinweis, je Gruppe eine Tabelle). */
export function berichtPdf(gruppen: { gruppe: string; zeilen: BerichtZeile[] }[], monat: string, e: ZeitkontoEinstellungen): Promise<Blob> {
  const fett = (z: BerichtZeile) => berichtWerte(z).map((_, i) => i === 5);
  return aufbauen(
    `Monatsbericht ${monatText(monat)}`,
    berichtHinweis(monat, e),
    gruppen.map((g) => ({
      gruppe: g.gruppe,
      body: g.zeilen.map(berichtWerte),
      fett: g.zeilen.map(fett),
      info: g.zeilen.map((z) => z.andauernd),
    })),
  );
}

const SPALTE: Partial<Record<keyof BerichtZeile, number>> = { uebertrag: 2, neu: 3, ausbezahlt: 4, saldo: 5, kr: 6, ur: 7, so: 8 };

/** Nachtrag: nur Mitarbeiter mit Änderungen seit dem versendeten Stand, geänderte Werte „alt → neu“ und fett. */
export function nachtragPdf(zeilen: NachtragZeile[], monat: string, e: ZeitkontoEinstellungen, seit: number): Promise<Blob> {
  const gruppen = [...new Set(zeilen.map((z) => z.gruppe))];
  const stand = new Date(seit).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
  return aufbauen(
    `Nachtrag Monatsbericht ${monatText(monat)}`,
    `Änderungen seit dem Bericht vom ${stand}. Geänderte Werte: bisher → neu. ${berichtHinweis(monat, e)}`,
    gruppen.map((g) => {
      const l = zeilen.filter((z) => z.gruppe === g);
      return {
        gruppe: g,
        body: l.map(nachtragWerte),
        fett: l.map((z) => BERICHT_SPALTEN.map((_, i) => i === 0 || z.felder.some((k) => SPALTE[k] === i))),
      };
    }),
  );
}
