const norm = (s: string) => s.trim().toLowerCase();
export const emailGueltig = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

/** Ersetzt eine E-Mail-Adresse überall (Werte und Schlüssel, Groß-/Kleinschreibung egal), z. B. wenn der Hub die Adresse eines Mitarbeiters ändert. */
export function emailErsetzen<T>(wert: T, alt: string, neu: string): { wert: T; geaendert: boolean } {
  const a = norm(alt);
  let geaendert = false;
  const treffer = (s: string) => s.length < 320 && norm(s) === a && ((geaendert = true), true);
  const gehe = (x: unknown): unknown => {
    if (typeof x === 'string') return treffer(x) ? neu : x;
    if (Array.isArray(x)) return x.map(gehe);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [treffer(k) ? neu : k, gehe(v)]));
    return x;
  };
  const w = gehe(wert) as T;
  return { wert: w, geaendert };
}
