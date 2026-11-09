/** Nach einem Update fehlen die Code-Teile der alten Version am Server – dann einmal neu laden statt Fehler zeigen. */
const SCHLUESSEL = 'alamida.modulNeuGeladen';

export const istVeraltetesModul = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    String((e as Error | undefined)?.message ?? e),
  );

/** Lädt die Seite neu, höchstens einmal pro Minute (verhindert Endlosschleifen). Liefert true, wenn neu geladen wird. */
export function neuLadenEinmal(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(SCHLUESSEL) ?? 0) < 60_000) return false;
    sessionStorage.setItem(SCHLUESSEL, String(Date.now()));
  } catch {
    /* ohne sessionStorage trotzdem neu laden */
  }
  location.reload();
  return true;
}

export async function nachladen<T>(laden: () => Promise<T>): Promise<T> {
  try {
    return await laden();
  } catch (e) {
    if (istVeraltetesModul(e) && neuLadenEinmal()) return new Promise<T>(() => undefined);
    throw e;
  }
}
