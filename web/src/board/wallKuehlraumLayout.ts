/** Raster für Wand-Kühlraum — passt in den sichtbaren Bereich ohne Scrollen. */
export function wallKuehlraumGridLayout(
  plaetze: number,
  opts?: { urnenSichtbar?: boolean }
): { cols: number; rows: number } {
  const n = Math.max(1, Math.min(99, plaetze));
  const urnen = opts?.urnenSichtbar === true;

  if (urnen) {
    if (n <= 4) return { cols: 2, rows: 2 };
    if (n <= 6) return { cols: 3, rows: 2 };
    if (n <= 9) return { cols: 3, rows: 3 };
    if (n <= 12) return { cols: 4, rows: 3 };
    if (n <= 16) return { cols: 4, rows: 4 };
    return { cols: 5, rows: Math.ceil(n / 5) };
  }

  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  if (n <= 9) return { cols: 3, rows: 3 };
  if (n <= 12) return { cols: 4, rows: 3 };
  if (n <= 16) return { cols: 4, rows: 4 };
  if (n <= 20) return { cols: 5, rows: 4 };
  const cols = 5;
  return { cols, rows: Math.ceil(n / cols) };
}
