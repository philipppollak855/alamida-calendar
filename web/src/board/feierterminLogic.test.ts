import { describe, it, expect } from 'vitest';
import {
  calendarBestattungsMarker,
  hatKremationImSterbefall,
  trauerfeier1AlsVerabschiedung,
} from './feierterminLogic';
import { buildKuehlraumTerminMarkers } from './kuehlraumTerminMarker';
import {
  buildWallCalendarEntries,
  buildWallCalendarEntriesForDay,
  buildWallFeierEntriesForDay,
} from './wallCalendar';
import type { Sterbefall } from '../types';

const base: Sterbefall = { id: '1', sterbefallId: '260001' };

describe('calendarBestattungsMarker', () => {
  it('S bei Trauerfeier ohne Kremation', () => {
    expect(
      calendarBestattungsMarker(
        { ...base, trauerfeierdatum: '08.06.2026' },
        ['trauerfeier'],
        'Trauerfeier'
      )
    ).toBe('S');
  });

  it('S bei Trauerfeier mit Kremation nur im Ablauf ohne Termin', () => {
    expect(
      calendarBestattungsMarker(
        {
          ...base,
          trauerfeierdatum: '29.05.2026',
          endzielTyp: 'kremation',
          ausstehend: [
            {
              schrittTyp: 'kremation',
              vonOrt: 'Kühl. Grafenbach',
              nachOrt: 'Innermanzing',
              status: 'geplant',
            },
          ],
        },
        ['trauerfeier'],
        'Trauerfeier'
      )
    ).toBe('S');
  });

  it('U bei Trauerfeier mit Kremationstermin vor Trauerfeier (Urnenweg)', () => {
    expect(
      calendarBestattungsMarker(
        {
          ...base,
          trauerfeierdatum: '08.06.2026',
          beisetzungsdatum: '08.06.2026',
          beisetzungszeit: '12:00',
          trauerfeierzeit: '10:00',
          endzielTyp: 'kremation',
          ausstehend: [
            {
              schrittTyp: 'kremation',
              terminAm: '01.06.2026',
              status: 'geplant',
            },
          ],
        },
        ['trauerfeier'],
        'Trauerfeier'
      )
    ).toBe('U');
  });

  it('U bei Trauerfeier nach erledigter Kremation', () => {
    expect(
      calendarBestattungsMarker(
        {
          ...base,
          trauerfeierdatum: '08.06.2026',
          verlauf: [{ typ: 'kremation', ort: 'Innermanzing', terminAm: '27.05.2026' }],
        },
        ['trauerfeier'],
        'Trauerfeier'
      )
    ).toBe('U');
  });

  it('S bei Trauerfeier wenn Kremation nur im Verlauf geplant (Zukunft)', () => {
    expect(
      calendarBestattungsMarker(
        {
          ...base,
          trauerfeierdatum: '29.05.2026',
          endzielTyp: 'kremation',
          verlauf: [{ typ: 'kremation', terminAm: '30.05.2026', nachOrt: 'Innermanzing' }],
          ausstehend: [{ schrittTyp: 'kremation', status: 'geplant' }],
        },
        ['trauerfeier'],
        'Trauerfeier'
      )
    ).toBe('S');
  });

  it('S bei gruppiertem Trauerfeier-Block mit Beisetzung im Anschluss trotz Kremation', () => {
    expect(
      calendarBestattungsMarker(
        {
          ...base,
          trauerfeierdatum: '29.05.2026',
          beisetzungsdatum: '29.05.2026',
          beisetzungszeit: 'Im Anschluss',
          imAnschluss: true,
          endzielTyp: 'kremation',
          ausstehend: [{ schrittTyp: 'kremation', status: 'geplant' }],
        },
        ['trauerfeier', 'beisetzung'],
        'Trauerfeier'
      )
    ).toBe('S');
  });

  it('U bei Beisetzung mit terminierten Kremation', () => {
    expect(
      calendarBestattungsMarker(
        {
          ...base,
          beisetzungsdatum: '09.06.2026',
          ausstehend: [
            {
              schrittTyp: 'kremation',
              terminAm: '08.06.2026',
              status: 'geplant',
            },
          ],
        },
        ['beisetzung'],
        'Beisetzung'
      )
    ).toBe('U');
  });

  it('U bei Beisetzung mit Kremation im Ablauf (auch ohne Termin)', () => {
    expect(
      calendarBestattungsMarker(
        {
          ...base,
          beisetzungsdatum: '09.06.2026',
          endzielTyp: 'kremation',
          ausstehend: [{ schrittTyp: 'kremation', status: 'geplant' }],
        },
        ['beisetzung'],
        'Beisetzung'
      )
    ).toBe('U');
  });

  it('S bei Beisetzung ohne Kremation', () => {
    expect(
      calendarBestattungsMarker(
        {
          ...base,
          beisetzungsdatum: '08.06.2026',
          endziel: 'Friedhof Ternitz',
          endzielTyp: 'beisetzung',
        },
        ['beisetzung'],
        'Beisetzung'
      )
    ).toBe('S');
  });

  it('kein S nur für Rosenkranz', () => {
    expect(
      calendarBestattungsMarker(
        { ...base, rosenkranzdatum: '08.06.2026' },
        ['rosenkranz'],
        'Rosenkranz'
      )
    ).toBeUndefined();
  });
});

describe('integration S/U markers', () => {
  it('Kalender: ein Trauerfeier-Termin mit S', () => {
    const entries = buildWallCalendarEntries([
      {
        ...base,
        verstorbenerName: 'Test',
        trauerfeierdatum: '08.06.2026',
        beisetzungsdatum: '08.06.2026',
        beisetzungszeit: 'Im Anschluss',
      },
    ]);
    const feier = entries.find((e) => e.title === 'Trauerfeier');
    expect(feier?.bestattungsMarker).toBe('S');
    expect(hatKremationImSterbefall({ ...base, endzielTyp: 'kremation' })).toBe(true);
  });

  it('Heute-Tab: Überführungen nicht in Feierliste (kommen aus flattenOffene)', () => {
    const sterbefaelle = [
      {
        ...base,
        id: 'u',
        verstorbenerName: 'Doppelt',
        trauerfeierdatum: '27.05.2026',
        ausstehend: [
          {
            zeile: 1,
            terminAm: '27.05.2026',
            vonOrt: 'UK - Wr. Neustadt',
            nachOrt: 'Kühl. Grafenbach',
            schrittTyp: 'abholung',
          },
        ],
      },
    ];
    const day = '2026-05-27';
    const alle = buildWallCalendarEntriesForDay(sterbefaelle, day);
    const feier = buildWallFeierEntriesForDay(sterbefaelle, day);
    expect(alle.some((e) => e.arts.includes('ueberfuehrung'))).toBe(true);
    expect(feier.some((e) => e.arts.includes('ueberfuehrung'))).toBe(false);
    expect(feier.some((e) => e.title === 'Trauerfeier')).toBe(true);
  });

  it('Heute-Tab: nur Feiertermine des gewählten Tages', () => {
    const heute = buildWallCalendarEntriesForDay(
      [
        {
          ...base,
          id: 'a',
          verstorbenerName: 'Heute',
          trauerfeierdatum: '08.06.2026',
        },
        {
          ...base,
          id: 'b',
          verstorbenerName: 'Morgen',
          trauerfeierdatum: '09.06.2026',
        },
      ],
      '2026-06-08'
    );
    expect(heute).toHaveLength(1);
    expect(heute[0]?.name).toBe('Heute');
    expect(heute[0]?.bestattungsMarker).toBe('S');
  });

  it('Kühlraum: Verabschiedung-Chip mit S bei Kremation ohne Termin', () => {
    const markers = buildKuehlraumTerminMarkers(
      {
        ...base,
        trauerfeierdatum: '29.05.2026',
        endzielTyp: 'kremation',
        ausstehend: [{ schrittTyp: 'kremation', status: 'geplant' }],
      },
      new Date(2026, 4, 27)
    );
    const feier = markers.find((m) => m.kind === 'verabschiedung');
    expect(feier?.bestattungsMarker).toBe('S');
    expect(markers.some((m) => m.kind === 'kremation' && m.label.includes('Termin offen'))).toBe(
      true
    );
  });

  it('Kühlraum: Trauerfeier-Chip mit U bei Kremation vor Trauerfeier', () => {
    const markers = buildKuehlraumTerminMarkers(
      {
        ...base,
        trauerfeierdatum: '08.06.2026',
        beisetzungsdatum: '08.06.2026',
        beisetzungszeit: '12:00',
        trauerfeierzeit: '10:00',
        endzielTyp: 'kremation',
        ausstehend: [
          {
            schrittTyp: 'kremation',
            terminAm: '01.06.2026',
            status: 'geplant',
          },
        ],
      },
      new Date(2026, 4, 28)
    );
    const tf = markers.find((m) => m.kind === 'trauerfeier');
    expect(tf?.bestattungsMarker).toBe('U');
  });

  it('Kühlraum: Trauerfeier-Chip mit U nach abgeschlossener Kremation', () => {
    const markers = buildKuehlraumTerminMarkers(
      {
        ...base,
        trauerfeierdatum: '08.06.2026',
        verlauf: [{ typ: 'kremation', ort: 'Innermanzing', terminAm: '07.06.2026' }],
      },
      new Date(2026, 5, 8)
    );
    const tf = markers.find((m) => m.kind === 'trauerfeier');
    expect(tf?.bestattungsMarker).toBe('U');
  });

  it('Kühlraum: Bernhard-Bock-Fall — Verabschiedung mit S, Kremation offen', () => {
    const markers = buildKuehlraumTerminMarkers(
      {
        ...base,
        trauerfeierdatum: '29.05.2026',
        endzielTyp: 'kremation',
        verlauf: [
          {
            typ: 'kremation',
            terminAm: '30.05.2026',
            vonOrt: 'Kühl. Grafenbach',
            nachOrt: 'Innermanzing',
          },
        ],
        ausstehend: [
          {
            schrittTyp: 'kremation',
            status: 'geplant',
            vonOrt: 'Kühl. Grafenbach',
            nachOrt: 'Innermanzing',
          },
        ],
      },
      new Date(2026, 4, 28)
    );
    const feier = markers.find((m) => m.kind === 'verabschiedung');
    expect(feier?.label).toContain('Verabschiedung');
    expect(feier?.bestattungsMarker).toBe('S');
    expect(markers.some((m) => m.kind === 'trauerfeier')).toBe(false);
    expect(trauerfeier1AlsVerabschiedung({
      ...base,
      trauerfeierdatum: '29.05.2026',
      endzielTyp: 'kremation',
      ausstehend: [{ schrittTyp: 'kremation', status: 'geplant' }],
    })).toBe(true);
  });
});
