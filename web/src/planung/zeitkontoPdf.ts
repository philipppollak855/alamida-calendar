import { nachladen } from '../modulNeuLaden';
import { BERICHT_SPALTEN, berichtHinweis, berichtWerte, monatText, type BerichtZeile, type ZeitkontoEinstellungen } from '../shared/zeitkonto';

/** Monatsbericht als PDF im Aufbau der bisherigen Vorlage (Titel, Hinweis, je Gruppe eine Tabelle). */
export async function berichtPdf(gruppen: { gruppe: string; zeilen: BerichtZeile[] }[], monat: string, e: ZeitkontoEinstellungen): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await nachladen(() => Promise.all([import('jspdf'), import('jspdf-autotable')]));
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rand = 15;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Monatsbericht ${monatText(monat)}`, rand, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(berichtHinweis(monat, e), rand, 27, { maxWidth: 180 });
  let y = 36;
  for (const g of gruppen) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(240, 240, 240);
    doc.setDrawColor(0);
    doc.rect(rand, y, 180, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Gruppe: ${g.gruppe}`, rand + 2, y + 5.5);
    autoTable(doc, {
      startY: y + 8,
      margin: { left: rand, right: rand },
      head: [[...BERICHT_SPALTEN]],
      body: g.zeilen.map(berichtWerte),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, lineColor: 0, lineWidth: 0.2, textColor: 0 },
      headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 52 } },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20) + 8;
  }
  const seiten = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.text(`Erstellt am ${new Date().toLocaleDateString('de-AT')} – Seite ${i}/${seiten}`, rand, 290);
  }
  return doc.output('blob');
}
