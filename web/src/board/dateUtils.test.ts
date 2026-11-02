import { describe, it, expect } from 'vitest';
import { extractDeDatum, extractZeitDe, startOfWeekMonday, dayKeyFromDate } from './dateUtils';
import { buildWallCalendarEntries, buildWallCalendarDays, filterCalendarEntries } from './wallCalendar';
import type { Sterbefall } from '../types';

describe('extractDeDatum', () => {
  it('extrahiert Datum aus Text mit Wochentag und Uhrzeit', () => {
    expect(extractDeDatum('Montag, 08.06.2026 13:00')).toBe('08.06.2026');
  });

  it('normalisiert einstellige Tage/Monate', () => {
    expect(extractDeDatum('8.6.2026')).toBe('08.06.2026');
  });
});

describe('extractZeitDe', () => {
  it('liest Uhrzeit aus kombiniertem Datumstext', () => {
    expect(extractZeitDe('Montag, 08.06.2026 13:00', undefined)).toBe('13:00');
  });

  it('bevorzugt separates Zeitfeld', () => {
    expect(extractZeitDe('08.06.2026', '14:30')).toBe('14:30');
  });
});

describe('buildWallCalendarEntries Feiertermine', () => {
  const base: Sterbefall = {
    id: 'doc1',
    sterbefallId: '260001',
    verstorbenerName: 'Max Mustermann',
  };

  it('trennt Trauerfeier und Beisetzung bei eigener Beisetzungs-Uhrzeit', () => {
    const entries = buildWallCalendarEntries([
      {
        ...base,
        trauerfeierdatum: 'Montag, 08.06.2026 10:00',
        beisetzungsdatum: '08.06.2026',
        beisetzungszeit: '14:00',
        endziel: 'Friedhof',
      },
    ]);
    const day = entries.filter((e) => e.dayKey === '2026-06-08');
    expect(day.some((e) => e.grouped)).toBe(false);
    expect(day.find((e) => e.title === 'Trauerfeier')?.timeLabel).toBe('10:00');
    expect(day.find((e) => e.title === 'Beisetzung')?.timeLabel).toBe('14:00');
  });

  it('Verabschiedung nur bei Rosenkranz am selben Tag', () => {
    const entries = buildWallCalendarEntries([
      {
        ...base,
        rosenkranzdatum: '07.06.2026',
        rosenkranzzeit: '09:00',
        trauerfeierdatum: '08.06.2026',
        trauerfeierzeit: '11:00',
      },
    ]);
    expect(entries.some((e) => e.arts.includes('verabschiedung'))).toBe(false);
    expect(entries.some((e) => e.arts.includes('trauerfeier'))).toBe(true);
    expect(entries.some((e) => e.arts.includes('rosenkranz'))).toBe(true);
  });

  it('Beisetzung im Anschluss ohne eigenes Datum nutzt Trauerfeier-Tag', () => {
    const entries = buildWallCalendarEntries([
      {
        ...base,
        trauerfeierdatum: '28.05.2026',
        trauerfeierzeit: '14:00',
        beisetzungszeit: 'Im Anschluss',
        imAnschluss: false,
      },
    ]);
    expect(entries.some((e) => e.arts.includes('beisetzung'))).toBe(true);
    expect(entries.some((e) => e.arts.includes('trauerfeier'))).toBe(true);
  });

  it('gruppiert Verabschiedung mit Rosenkranz, Beisetzung separat bei eigener Uhrzeit', () => {
    const entries = buildWallCalendarEntries([
      {
        ...base,
        rosenkranzdatum: '08.06.2026',
        rosenkranzzeit: '09:00',
        trauerfeierdatum: '08.06.2026',
        trauerfeierzeit: '11:00',
        imAnschluss: true,
        beisetzungsdatum: '08.06.2026',
        beisetzungszeit: '12:00',
      },
    ]);
    const block = entries.find((e) => e.grouped && e.title === 'Verabschiedung');
    expect(block?.badges).toEqual(expect.arrayContaining(['Rosenkranz', 'Verabschiedung']));
    expect(entries.some((e) => !e.grouped && e.title === 'Beisetzung')).toBe(true);
  });

  it('im Anschluss: ein Kalendertermin Trauerfeier', () => {
    const entries = buildWallCalendarEntries([
      {
        ...base,
        trauerfeierdatum: '28.05.2026',
        trauerfeierzeit: '14:00',
        beisetzungszeit: 'Im Anschluss',
      },
    ]);
    const block = entries.find((e) => e.grouped && e.title === 'Trauerfeier');
    expect(block?.arts).toEqual(expect.arrayContaining(['trauerfeier', 'beisetzung']));
    expect(entries.filter((e) => e.dayKey === '2026-05-28')).toHaveLength(1);
  });

  it('gleiche Uhrzeit wie Trauerfeier: ein Termin Trauerfeier', () => {
    const entries = buildWallCalendarEntries([
      {
        ...base,
        trauerfeierdatum: '28.05.2026',
        trauerfeierzeit: '14:00',
        beisetzungsdatum: '28.05.2026',
        beisetzungszeit: '14:00',
        imAnschluss: false,
      },
    ]);
    expect(entries.filter((e) => e.dayKey === '2026-05-28')).toHaveLength(1);
    expect(entries[0]?.title).toBe('Trauerfeier');
    expect(entries[0]?.grouped).toBe(true);
  });

  it('Trauerfeier + Beisetzung im Anschluss: ein kombinierter Termin (Touahria)', () => {
    const entries = buildWallCalendarEntries([
      {
        ...base,
        verstorbenerName: 'Gertraud Touahria',
        trauerfeierdatum: '08.06.2026',
        trauerfeierzeit: '14:00',
        trauerfeierort: 'St. Lorenzen - Pfarrfriedhof - Halle',
        beisetzungsdatum: '08.06.2026',
        beisetzungszeit: 'Im Anschluss',
        imAnschluss: true,
        endziel: 'St. Lorenzen - Pfarrfriedhof',
      },
    ]);
    const day = entries.filter((e) => e.dayKey === '2026-06-08');
    expect(day).toHaveLength(1);
    expect(day[0]?.grouped).toBe(true);
    expect(day[0]?.title).toBe('Trauerfeier');
    expect(day[0]?.timeLabel).toBe('14:00');
    expect(day[0]?.arts).toEqual(expect.arrayContaining(['trauerfeier', 'beisetzung']));
  });

  it('ignoriert erfundene Uhrzeit im Beisetzungs-Datum bei Im Anschluss', () => {
    const entries = buildWallCalendarEntries([
      {
        ...base,
        trauerfeierdatum: '08.06.2026',
        trauerfeierzeit: '14:00',
        beisetzungsdatum: 'Montag, 08.06.2026 13:00',
        beisetzungszeit: 'Im Anschluss',
        imAnschluss: true,
      },
    ]);
    expect(entries.filter((e) => e.dayKey === '2026-06-08')).toHaveLength(1);
    expect(entries.find((e) => e.title === 'Beisetzung' && !e.grouped)).toBeUndefined();
  });

  it('Im Anschluss mit gleicher Uhrzeit in beiden Feldern: ein Termin', () => {
    const entries = buildWallCalendarEntries([
      {
        ...base,
        trauerfeierdatum: '28.05.2026',
        trauerfeierzeit: '14:00',
        beisetzungsdatum: '28.05.2026',
        beisetzungszeit: '14:00',
        imAnschluss: true,
      },
    ]);
    expect(entries.filter((e) => e.dayKey === '2026-05-28')).toHaveLength(1);
    expect(entries.find((e) => e.title === 'Beisetzung' && !e.grouped)).toBeUndefined();
  });
});

describe('startOfWeekMonday', () => {
  it('liefert Montag derselben Woche', () => {
    const wed = new Date(2026, 4, 27);
    expect(dayKeyFromDate(startOfWeekMonday(wed))).toBe('2026-05-25');
  });
});

describe('buildWallCalendarDays Wochenraster', () => {
  const anchor = new Date(2026, 4, 27);

  it('7 Tage: Montag bis Sonntag', () => {
    const days = buildWallCalendarDays([], 7, anchor);
    expect(days).toHaveLength(7);
    expect(days[0]?.dayKey).toBe('2026-05-25');
    expect(days[6]?.dayKey).toBe('2026-05-31');
    expect(days[0]?.weekdayShort.toLowerCase()).toMatch(/^mo/);
    expect(days[6]?.weekdayShort.toLowerCase()).toMatch(/^so/);
  });

  it('14 Tage: zwei volle Wochen Mo–So', () => {
    const days = buildWallCalendarDays([], 14, anchor);
    expect(days).toHaveLength(14);
    expect(days[0]?.dayKey).toBe('2026-05-25');
    expect(days[7]?.dayKey).toBe('2026-06-01');
    expect(days[13]?.dayKey).toBe('2026-06-07');
  });

  it('filterCalendarEntries folgt dem Wochenraster', () => {
    const entries = filterCalendarEntries(
      [
        {
          id: 'a',
          docId: 'a',
          sterbefallId: '1',
          dayKey: '2026-05-24',
          dayLabel: '',
          timeLabel: '',
          sortMs: 0,
          name: 'Alt',
          title: '',
          subtitle: '',
          badges: [],
          grouped: false,
          arts: ['beisetzung'],
          searchText: '',
        },
        {
          id: 'b',
          docId: 'b',
          sterbefallId: '2',
          dayKey: '2026-05-26',
          dayLabel: '',
          timeLabel: '',
          sortMs: 0,
          name: 'In Woche',
          title: '',
          subtitle: '',
          badges: [],
          grouped: false,
          arts: ['beisetzung'],
          searchText: '',
        },
      ],
      7,
      anchor,
      ''
    );
    expect(entries.map((e) => e.dayKey)).toEqual(['2026-05-26']);
  });
});
