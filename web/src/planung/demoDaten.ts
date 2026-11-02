import { ausGoogleEvent, plusTage, startDesTages, type GoogleEvent, type Kategorie, type Termin } from './planungLogic';

const FAELLE: [string, string][] = [
  ['260087', 'Anton Schellmann'],
  ['260091', 'Gabriele Melichar'],
  ['260095', 'Josef Hofer'],
  ['260098', 'Maria Wagner'],
];

/** Beispieltermine relativ zu heute, solange keine Google-Anmeldung eingerichtet ist. */
export function demoTermine(jetzt = new Date()): Termin[] {
  const heute = startDesTages(jetzt);
  const at = (tage: number, h?: number, m = 0) => {
    const d = plusTage(heute, tage);
    if (h !== undefined) d.setHours(h, m);
    return d;
  };
  const eintraege: [number, Kategorie, Date, number | null, string, string?][] = [
    [0, 'Abholung', at(-1, 7, 30), 60, 'UK Neunkirchen', 'UK Neunkirchen → Kühlr. Grafenbach'],
    [0, 'Trauergespraech', at(0, 10), 60, 'Bestattung Grafenbach'],
    [0, 'Rosenkranz', at(1, 18, 30), 60, 'Pfarrkirche Ternitz'],
    [0, 'Trauerfeier', at(2, 13), 60, 'Pfarrkirche Ternitz'],
    [0, 'Beisetzung', at(2, 14), 60, 'Friedhof Ternitz'],
    [1, 'Abholung', at(0, 8), 60, 'Pflegeheim Gloggnitz', 'Pflegeheim Gloggnitz → Kühlr. Grafenbach'],
    [1, 'Kremation', at(3), null, 'Feuerhalle Wiener Neustadt', 'Kühlr. Grafenbach → Feuerhalle Wr. Neustadt'],
    [1, 'Trauerfeier', at(2, 14, 30), 60, 'Aufbahrungshalle Gloggnitz'],
    [2, 'Trauergespraech', at(0, 14), 60, 'Hausbesuch'],
    [2, 'Ueberfuehrung', at(1, 9), 120, 'Friedhof Hollabrunn', 'Kühlr. Grafenbach → Hollabrunn'],
    [2, 'Beisetzung', at(4), null, 'Friedhof Hollabrunn'],
    [3, 'Trauergespraech', at(1, 11), 60, 'Bestattung Grafenbach'],
    [3, 'Rosenkranz', at(5), null, 'Kapelle Pitten'],
  ];
  const events: GoogleEvent[] = eintraege.map(([fall, kat, start, dauer, ort, route], i) => {
    const [id, name] = FAELLE[fall];
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      id: `demo${i}`,
      summary: `${kat} ${name}${route ? `: ${route}` : ` – ${ort}`}`,
      description: `Sterbefall: ${id} | ${name}\nOrt: ${ort}\nKategorie: ${kat}`,
      location: ort,
      start: dauer === null ? { date: iso(start) } : { dateTime: start.toISOString() },
      end: dauer === null ? { date: iso(plusTage(start, 1)) } : { dateTime: new Date(start.getTime() + dauer * 60_000).toISOString() },
      extendedProperties: { private: { kategorie: kat, sterbefallId: id } },
    };
  });
  return events.map((e) => ausGoogleEvent(e, 'demo', 'Beispieldaten')!);
}
