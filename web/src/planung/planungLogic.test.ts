import { describe, expect, it } from 'vitest';
import { ausGoogleEvent, fahrten, nachGruppe, sterbefaelle, termineAmTag, warnungen, type GoogleEvent } from './planungLogic';

const ev = (id: string, kat: string, start: string, end: string, fall = '260087 | Anton Schellmann'): GoogleEvent => ({
  id,
  summary: `${kat} Test`,
  description: `Sterbefall: ${fall}\nKategorie: ${kat}`,
  start: start.length === 10 ? { date: start } : { dateTime: start },
  end: end.length === 10 ? { date: end } : { dateTime: end },
  extendedProperties: { private: { kategorie: kat, sterbefallId: fall.split(' | ')[0] } },
});
const t = (e: GoogleEvent) => ausGoogleEvent(e, 'cal', 'Kalender')!;
const jetzt = new Date(2026, 4, 20, 8, 0);

describe('planungLogic', () => {
  it('liest Kategorie, Sterbefall und Name aus dem Agent-Event', () => {
    const x = t(ev('a', 'Beisetzung', '2026-05-28T14:00:00+02:00', '2026-05-28T15:00:00+02:00'));
    expect(x.kategorie).toBe('Beisetzung');
    expect(x.sterbefallId).toBe('260087');
    expect(x.verstorbener).toBe('Anton Schellmann');
    expect(x.ganztaegig).toBe(false);
  });

  it('erkennt Kategorie ohne Agent-Metadaten am Titel', () => {
    expect(t({ id: 'x', summary: '🚐 Abholung Huber', start: { date: '2026-05-21' }, end: { date: '2026-05-22' } }).kategorie).toBe('Abholung');
  });

  it('teilt den Tag in Gruppen, ganztägig zuerst', () => {
    const tag = [
      t(ev('a', 'Beisetzung', '2026-05-28T14:00:00+02:00', '2026-05-28T15:00:00+02:00')),
      t(ev('b', 'Rosenkranz', '2026-05-28', '2026-05-29')),
      t(ev('c', 'Abholung', '2026-05-28T09:00:00+02:00', '2026-05-28T10:00:00+02:00')),
      t(ev('d', 'Trauergespraech', '2026-05-29T09:00:00+02:00', '2026-05-29T10:00:00+02:00')),
    ];
    const g = nachGruppe(termineAmTag(tag, new Date(2026, 4, 28)));
    expect(g.Zeremonien.map((x) => x.kategorie)).toEqual(['Rosenkranz', 'Beisetzung']);
    expect(g.Fahrten).toHaveLength(1);
    expect(g['Gespräche']).toHaveLength(0);
  });

  it('gruppiert Sterbefälle und sortiert nach nächstem Termin', () => {
    const f = sterbefaelle(
      [
        t(ev('a', 'Beisetzung', '2026-05-30', '2026-05-31', '1 | A')),
        t(ev('b', 'Beisetzung', '2026-05-22', '2026-05-23', '2 | B')),
        t(ev('c', 'Abholung', '2026-05-01', '2026-05-02', '3 | C')),
      ],
      jetzt,
    );
    expect(f.map((x) => x.name)).toEqual(['B', 'A', 'C']);
    expect(f[2].naechster).toBeUndefined();
  });

  it('listet nur kommende Fahrten', () => {
    const f = fahrten(
      [
        t(ev('a', 'Abholung', '2026-05-19', '2026-05-20')),
        t(ev('b', 'Kremation', '2026-05-25', '2026-05-26')),
        t(ev('c', 'Beisetzung', '2026-05-25', '2026-05-26')),
      ],
      jetzt,
    );
    expect(f.map((x) => x.kategorie)).toEqual(['Kremation']);
  });

  it('warnt bei Überschneidung, fehlender Uhrzeit und falscher Reihenfolge', () => {
    const w = warnungen(
      [
        t(ev('a', 'Beisetzung', '2026-05-28T14:00:00+02:00', '2026-05-28T15:00:00+02:00', '1 | A')),
        t(ev('b', 'Trauerfeier', '2026-05-28T14:30:00+02:00', '2026-05-28T15:30:00+02:00', '2 | B')),
        t(ev('c', 'Rosenkranz', '2026-05-27', '2026-05-28', '3 | C')),
        t(ev('d', 'Trauerfeier', '2026-05-28T16:00:00+02:00', '2026-05-28T17:00:00+02:00', '1 | A')),
      ],
      jetzt,
    );
    expect(w.map((x) => x.art).sort()).toEqual(['ohneUhrzeit', 'reihenfolge', 'ueberschneidung']);
  });
});
