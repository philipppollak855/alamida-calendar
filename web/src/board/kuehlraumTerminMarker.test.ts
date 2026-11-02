import { describe, it, expect } from 'vitest';
import { buildKuehlraumTerminMarkers } from './kuehlraumTerminMarker';
import type { Sterbefall } from '../types';

const now = new Date(2026, 4, 27);

function fall(overrides: Partial<Sterbefall>): Sterbefall {
  return { id: 'x', ...overrides };
}

describe('buildKuehlraumTerminMarkers', () => {
  it('zeigt Trauerfeier, Kremation und Beisetzung parallel bei getrennter Beisetzung', () => {
    const markers = buildKuehlraumTerminMarkers(
      fall({
        trauerfeierdatum: '08.06.2026',
        beisetzungsdatum: '08.06.2026',
        beisetzungszeit: '12:00',
        trauerfeierzeit: '10:00',
        endzielTyp: 'kremation',
        ausstehend: [
          {
            schrittTyp: 'kremation',
            vonOrt: 'Kühl. Grafenbach',
            nachOrt: 'Innermanzing',
            status: 'geplant',
          },
        ],
      }),
      now
    );

    const kinds = markers.map((m) => m.kind);
    expect(kinds).toContain('trauerfeier');
    expect(kinds).toContain('kremation');
    expect(kinds).toContain('beisetzung');
  });

  it('nur Trauerfeier bei Im Anschluss am selben Tag', () => {
    const markers = buildKuehlraumTerminMarkers(
      fall({
        trauerfeierdatum: '03.06.2026',
        beisetzungsdatum: '03.06.2026',
        beisetzungszeit: 'Im Anschluss',
        imAnschluss: true,
      }),
      now
    );

    expect(markers.filter((m) => m.kind === 'trauerfeier')).toHaveLength(1);
    expect(markers.some((m) => m.kind === 'beisetzung')).toBe(false);
  });

  it('nur Trauerfeier bei gleicher Uhrzeit', () => {
    const markers = buildKuehlraumTerminMarkers(
      fall({
        trauerfeierdatum: '03.06.2026',
        trauerfeierzeit: '14:00',
        beisetzungsdatum: '03.06.2026',
        beisetzungszeit: '14:00',
      }),
      now
    );

    expect(markers.filter((m) => m.kind === 'trauerfeier')).toHaveLength(1);
    expect(markers.some((m) => m.kind === 'beisetzung')).toBe(false);
  });

  it('Verabschiedung und Beisetzung bei Rosenkranz und getrennter Beisetzung', () => {
    const markers = buildKuehlraumTerminMarkers(
      fall({
        rosenkranzdatum: '08.06.2026',
        trauerfeierdatum: '08.06.2026',
        beisetzungsdatum: '09.06.2026',
      }),
      now
    );

    expect(markers.some((m) => m.kind === 'verabschiedung')).toBe(true);
    expect(markers.some((m) => m.kind === 'beisetzung')).toBe(true);
    expect(markers.some((m) => m.kind === 'trauerfeier')).toBe(false);
  });

  it('Beisetzung-Chip erhaelt S-Marker ohne Kremation', () => {
    const markers = buildKuehlraumTerminMarkers(
      fall({
        trauerfeierdatum: '03.06.2026',
        beisetzungsdatum: '08.06.2026',
        beisetzungszeit: '12:00',
        trauerfeierzeit: '10:00',
      }),
      now
    );
    const bs = markers.find((m) => m.kind === 'beisetzung');
    expect(bs?.bestattungsMarker).toBe('S');
  });

  it('parst Alamida-Datumstext mit Wochentag', () => {
    const markers = buildKuehlraumTerminMarkers(
      fall({
        trauerfeierdatum: 'Montag, 08.06.2026',
        beisetzungsdatum: 'Montag, 08.06.2026',
        beisetzungszeit: '12:00',
        trauerfeierzeit: '10:00',
        endzielTyp: 'kremation',
      }),
      now
    );

    expect(markers.some((m) => m.kind === 'trauerfeier')).toBe(true);
    expect(markers.some((m) => m.kind === 'beisetzung')).toBe(true);
  });
});
