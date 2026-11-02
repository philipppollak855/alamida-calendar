import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LiveDataBar } from '../components/LiveDataBar';
import { BoardToolbar } from '../components/board/BoardToolbar';
import { TransferCardItem } from '../components/board/TransferCardItem';
import { matchSterbefallQuery, matchTransferQuery, normalizeBoardSearch } from '../board/boardSearch';
import { isImEigenenKuehlraum } from '../board/kuehlraumLogic';
import { useNarrowViewport } from '../hooks/useNarrowViewport';
import { useCalendarDay } from '../hooks/useCalendarDay';
import { useFirestoreCollection } from '../hooks/useFirestoreCollection';
import { useSterbefaelle } from '../hooks/useSterbefaelle';
import { firebaseConfigured } from '../firebase';
import {
  boardStats,
  buildAlleEigeneKuehlraumSlots,
  flattenOffene,
  kuehlraumGesamtBelegung,
} from '../board/boardUtils';
import {
  BOARD_SECTIONS,
  parseBoardSection,
  type BoardSection,
} from '../board/boardSections';
import { filterAktiveSterbefaelle, istInHistory } from '../board/historieLogic';
import { fallAbschlussGrundLabel } from '../board/fallAbschluss';
import { buildUrnenListe, countUrnen } from '../board/urnenLogic';
import { UrnenBereichPanel } from '../components/UrnenBereichPanel';
import { KuehlraumPlatzGrid } from '../components/KuehlraumPlatzGrid';
import { BoardGlobalSearchResults } from '../components/board/BoardGlobalSearchResults';
import { buildBoardSearchHits, type BoardSearchHit } from '../board/boardGlobalSearch';
import { FallAbschlussDialog } from '../components/FallAbschlussDialog';
import { useFallAbschluss } from '../hooks/useFallAbschluss';
import { getErledigteZeilen } from '../board/ueberfuehrungErledigt';
import { removeSterbefallFromDisposition } from '../services/dispositionFall';
import { toggleUeberfuehrungErledigt } from '../services/ueberfuehrungErledigt';
import { clearSterbefallUrnenRetour } from '../services/urnenRetour';
import { DispositionSettingsPanel } from '../components/DispositionSettingsPanel';
import { EndzielChip, SchrittBadge } from '../ui/SchrittBadge';
import { StatCard } from '../ui/StatCard';
import { useDispositionSettings } from '../settings/SettingsProvider';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import type { Sterbefall, MonitoringEvent } from '../types';

type TransferFilter = 'alle' | 'heute' | 'abholung';
type FaelleFilter = 'alle' | 'kuehlraum' | 'neu' | 'heute';

function sectionBadge(
  section: BoardSection,
  stats: {
    offen: number;
    heute: number;
    abholung: number;
    belegt: number;
    plaetze: number;
    urnen: number;
    faelle: number;
  }
): number | null {
  switch (section) {
    case 'ueberfuehrungen':
      return stats.offen;
    case 'lager':
      return stats.belegt + stats.urnen;
    case 'faelle':
      return stats.faelle;
    default:
      return null;
  }
}

export function BoardPage() {
  const isNarrow = useNarrowViewport();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = parseBoardSection(searchParams.get('tab'));
  const calendarDay = useCalendarDay();
  const calendarNow = useMemo(() => {
    const [y, m, d] = calendarDay.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [calendarDay]);
  const { settings } = useDispositionSettings();
  const { items: sterbefaelleRaw, loading, error } = useSterbefaelle();
  const sterbefaelle = useMemo(
    () => filterAktiveSterbefaelle(sterbefaelleRaw),
    [sterbefaelleRaw]
  );
  const { items: events } = useFirestoreCollection<MonitoringEvent>(
    'events',
    'createdAt',
    20
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TransferFilter>('alle');
  const [urnenPending, setUrnenPending] = useState<string | null>(null);
  const [urnenError, setUrnenError] = useState<string | null>(null);
  const [removePending, setRemovePending] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [erledigtPending, setErledigtPending] = useState<string | null>(null);
  const [erledigtError, setErledigtError] = useState<string | null>(null);
  const [expandedKrKey, setExpandedKrKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const [faelleFilter, setFaelleFilter] = useState<FaelleFilter>('alle');
  const abschluss = useFallAbschluss();

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        const q = normalizeBoardSearch(searchQuery);
        if (q) p.set('q', q);
        else p.delete('q');
        return p;
      },
      { replace: true }
    );
  }, [searchQuery, setSearchParams]);

  const offene = useMemo(() => flattenOffene(sterbefaelle), [sterbefaelle, calendarDay]);
  const sterbefallByDocId = useMemo(
    () => new Map(sterbefaelle.map((s) => [s.id, s])),
    [sterbefaelle]
  );
  const stats = useMemo(() => boardStats(sterbefaelle, offene), [sterbefaelle, offene, calendarDay]);
  const kuehlraumGrids = useMemo(
    () => buildAlleEigeneKuehlraumSlots(sterbefaelle, settings.eigeneKuehlraeume),
    [sterbefaelle, settings.eigeneKuehlraeume]
  );
  const kuehlraumBelegung = useMemo(
    () => kuehlraumGesamtBelegung(kuehlraumGrids),
    [kuehlraumGrids]
  );

  const filteredOffene = useMemo(() => {
    let rows = offene;
    if (filter === 'heute') rows = rows.filter((o) => o.status === 'heute');
    if (filter === 'abholung') {
      rows = rows.filter((o) => o.istAbholungVomSterbeort || o.status === 'abholung_noetig');
    }
    if (searchQuery.trim()) {
      rows = rows.filter((o) => matchTransferQuery(o, searchQuery));
    }
    return rows;
  }, [offene, filter, searchQuery]);

  const faelleSearchActive = section === 'faelle' && normalizeBoardSearch(searchQuery).length > 0;

  const faelleFiltered = useMemo(() => {
    let list = faelleSearchActive ? sterbefaelleRaw : sterbefaelle;
    if (faelleFilter === 'kuehlraum') list = list.filter((s) => isImEigenenKuehlraum(s));
    if (faelleFilter === 'neu') list = list.filter((s) => s.istNeuerFall);
    if (faelleFilter === 'heute') {
      list = list.filter((s) =>
        offene.some((o) => o.docId === s.id && o.status === 'heute')
      );
    }
    if (faelleSearchActive) {
      list = list.filter((s) => matchSterbefallQuery(s, searchQuery));
      list = [...list].sort((a, b) => {
        const ah = istInHistory(a) ? 1 : 0;
        const bh = istInHistory(b) ? 1 : 0;
        if (ah !== bh) return ah - bh;
        return (a.verstorbenerName || a.sterbefallId || '').localeCompare(
          b.verstorbenerName || b.sterbefallId || '',
          'de'
        );
      });
    }
    return list;
  }, [sterbefaelle, sterbefaelleRaw, faelleFilter, faelleSearchActive, searchQuery, offene]);

  const faelleChipCounts = useMemo(
    () => ({
      alle: sterbefaelle.length,
      kuehlraum: sterbefaelle.filter((s) => isImEigenenKuehlraum(s)).length,
      neu: sterbefaelle.filter((s) => s.istNeuerFall).length,
      heute: sterbefaelle.filter((s) =>
        offene.some((o) => o.docId === s.id && o.status === 'heute')
      ).length,
    }),
    [sterbefaelle, offene]
  );

  const lagerSearchActive = normalizeBoardSearch(searchQuery).length > 0;
  const overviewSearchActive = section === 'uebersicht' && lagerSearchActive;

  const heuteOffene = useMemo(
    () => offene.filter((o) => o.status === 'heute'),
    [offene]
  );

  const andereKuehlraeume = useMemo(() => {
    const map = new Map<string, Sterbefall[]>();
    for (const s of sterbefaelle) {
      if (s.status !== 'im_kuehlraum' || !s.kuehlraumId) continue;
      if (matchEigenerKuehlraum(s.kuehlraumId)) continue;
      const kr = s.kuehlraumId.trim();
      if (!map.has(kr)) map.set(kr, []);
      map.get(kr)!.push(s);
    }
    return [...map.entries()];
  }, [sterbefaelle]);

  const belegtKuehlraeume = kuehlraumBelegung.belegt;
  const urnenListe = useMemo(() => buildUrnenListe(sterbefaelle), [sterbefaelle]);
  const urnenCount = useMemo(() => countUrnen(sterbefaelle), [sterbefaelle]);

  const globalSearchHits = useMemo(
    () =>
      buildBoardSearchHits(
        searchQuery,
        sterbefaelle,
        offene,
        urnenListe,
        kuehlraumGrids,
        sterbefaelleRaw
    ),
    [searchQuery, sterbefaelle, sterbefaelleRaw, offene, urnenListe, kuehlraumGrids]
  );

  const badgeStats = useMemo(
    () => ({
      offen: stats.offen,
      heute: stats.heute,
      abholung: stats.abholung,
      belegt: belegtKuehlraeume,
      plaetze: kuehlraumBelegung.plaetze,
      urnen: urnenCount,
      faelle: sterbefaelle.length,
    }),
    [stats, belegtKuehlraeume, kuehlraumBelegung.plaetze, urnenCount, sterbefaelle.length]
  );

  const goToSection = useCallback(
    (next: BoardSection, nextFilter?: TransferFilter) => {
      if (nextFilter) setFilter(nextFilter);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === 'uebersicht') p.delete('tab');
          else p.set('tab', next);
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const openSearchHit = useCallback(
    (hit: BoardSearchHit) => {
      goToSection(hit.tab);
    },
    [goToSection]
  );

  async function handleRemoveFromDisposition(s: Sterbefall) {
    const name = s.verstorbenerName || s.sterbefallId || s.id;
    const ok = window.confirm(
      `"${name}" aus Disposition und Wandmonitor entfernen?\n\n` +
        'Der Fall bleibt in Alamida; er erscheint hier nicht mehr (z. B. Testfälle).'
    );
    if (!ok) return;

    setRemoveError(null);
    setRemovePending(s.id);
    try {
      await removeSterbefallFromDisposition(s.id, s.sterbefallId);
      if (expandedId === s.id) setExpandedId(null);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Entfernen fehlgeschlagen');
    } finally {
      setRemovePending(null);
    }
  }

  async function handleUrnenUndo(docId: string) {
    setUrnenError(null);
    setUrnenPending(docId);
    try {
      await clearSterbefallUrnenRetour(docId);
    } catch (e) {
      setUrnenError(e instanceof Error ? e.message : 'Rückgängig fehlgeschlagen');
    } finally {
      setUrnenPending(null);
    }
  }

  async function toggleErledigt(
    docId: string,
    zeile: number,
    currentlyErledigt: boolean
  ) {
    const key = `${docId}:${zeile}`;
    setErledigtError(null);
    setErledigtPending(key);
    try {
      const s = sterbefallByDocId.get(docId);
      const zeilen = s ? getErledigteZeilen(s) : [];
      await toggleUeberfuehrungErledigt(docId, zeile, zeilen, currentlyErledigt);
    } catch (e) {
      setErledigtError(
        e instanceof Error ? e.message : 'Erledigt-Markierung fehlgeschlagen'
      );
    } finally {
      setErledigtPending(null);
    }
  }

  if (!firebaseConfigured) {
    return (
      <div className="alert alert-warn">
        Firebase-Web-Config fehlt — <code>web/.env</code> prüfen.
      </div>
    );
  }

  return (
    <div className={`board board-workspace ${isNarrow ? 'board--narrow' : ''}`}>
      <header className="board-hero board-workspace-hero">
        <div className="board-hero-text">
          <h1>Disposition</h1>
          {!isNarrow && (
            <p>Überführungen, Kühlraum und Verlauf — strukturiert nach Bereichen</p>
          )}
        </div>
        <div className="board-hero-actions">
          <LiveDataBar compact={isNarrow} />
          <Link to="/wall" className="board-wall-link board-wall-link--visible">
            Wand
          </Link>
        </div>
      </header>

      <nav className="board-section-nav" aria-label="Disposition-Bereiche">
        {BOARD_SECTIONS.map((item) => {
          const badge = sectionBadge(item.id, badgeStats);
          return (
            <button
              key={item.id}
              type="button"
              className={`board-section-tab ${section === item.id ? 'active' : ''}`}
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => goToSection(item.id)}
            >
              <span className="board-section-tab-label">
                {isNarrow ? item.short : item.label}
              </span>
              {badge != null && badge > 0 && (
                <span className="board-section-badge">{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <main className="board-section-body">
        {error && <div className="alert alert-danger">{error}</div>}
        {urnenError && <div className="alert alert-danger">{urnenError}</div>}

        {section !== 'einstellungen' && (
          <BoardToolbar
            search={searchQuery}
            onSearchChange={setSearchQuery}
            placeholder={
              section === 'uebersicht'
                ? 'Alle Bereiche durchsuchen — Name, Fall-Nr., Ort…'
                : section === 'lager'
                  ? 'Im Lager suchen — Name oder Fall-Nr.…'
                  : section === 'faelle'
                    ? 'Fälle durchsuchen…'
                    : 'Überführung suchen — Name, Ort, Fall-Nr.…'
            }
            chips={
              section === 'faelle'
                ? [
                    { id: 'alle', label: 'Alle', count: faelleChipCounts.alle },
                    { id: 'kuehlraum', label: 'Kühlraum', count: faelleChipCounts.kuehlraum },
                    { id: 'heute', label: 'Termin heute', count: faelleChipCounts.heute },
                    { id: 'neu', label: 'Neu', count: faelleChipCounts.neu },
                  ]
                : undefined
            }
            activeChip={section === 'faelle' ? faelleFilter : undefined}
            onChipChange={
              section === 'faelle' ? (id) => setFaelleFilter(id as FaelleFilter) : undefined
            }
            resultCount={
              section === 'uebersicht' && lagerSearchActive
                ? globalSearchHits.length
                : section === 'faelle'
                  ? faelleFiltered.length
                  : section === 'ueberfuehrungen'
                    ? filteredOffene.length
                    : section === 'lager' && lagerSearchActive
                      ? kuehlraumGrids.reduce(
                          (n, g) =>
                            n +
                            g.slots.filter(
                              (f) => f && matchSterbefallQuery(f, searchQuery)
                            ).length,
                          0
                        )
                      : undefined
            }
            totalCount={
              section === 'faelle'
                ? faelleSearchActive
                  ? sterbefaelleRaw.length
                  : sterbefaelle.length
                : section === 'ueberfuehrungen'
                  ? offene.length
                  : section === 'lager' && lagerSearchActive
                    ? belegtKuehlraeume
                    : undefined
            }
          />
        )}

        {section === 'uebersicht' && overviewSearchActive && (
          <BoardGlobalSearchResults
            hits={globalSearchHits}
            query={searchQuery}
            onOpen={openSearchHit}
            onClear={() => setSearchQuery('')}
          />
        )}

        {section === 'uebersicht' && !overviewSearchActive && (
          <div className="board-overview">
            <div className="board-overview-kpis kpi-grid">
              <StatCard
                label="Offen"
                value={stats.offen}
                hint="geplante Schritte"
                accent="accent"
                onClick={() => goToSection('ueberfuehrungen', 'alle')}
              />
              <StatCard
                label="Heute"
                value={stats.heute}
                hint="Termin heute"
                accent="warn"
                onClick={() => goToSection('ueberfuehrungen', 'heute')}
              />
              <StatCard
                label="Abholung"
                value={stats.abholung}
                hint="inkl. Sterbeort"
                accent="warn"
                onClick={() => goToSection('ueberfuehrungen', 'abholung')}
              />
              <StatCard
                label="Kühlraum"
                value={`${belegtKuehlraeume}/${kuehlraumBelegung.plaetze}`}
                hint={
                  kuehlraumGrids.length > 1
                    ? `${kuehlraumGrids.length} Kühlräume`
                    : kuehlraumGrids[0]?.cfg.label ?? 'Kühlraum'
                }
                accent="success"
                onClick={() => goToSection('lager')}
              />
              <StatCard
                label="Urnen"
                value={urnenCount}
                hint="Retour aus Kremation"
                accent="accent"
                onClick={() => goToSection('lager')}
              />
            </div>

            <div className="board-overview-grid">
              <section className="panel board-overview-card">
                <div className="board-overview-card-head">
                  <div>
                    <h2>Heute</h2>
                    <p>{stats.heute} Termin{stats.heute === 1 ? '' : 'e'}</p>
                  </div>
                  <button
                    type="button"
                    className="board-overview-link"
                    onClick={() => goToSection('ueberfuehrungen', 'heute')}
                  >
                    Alle →
                  </button>
                </div>
                {heuteOffene.length === 0 ? (
                  <p className="board-overview-empty">Keine Termine heute.</p>
                ) : (
                  <div className="board-overview-preview">
                    {heuteOffene.slice(0, 3).map((r) => {
                      const pendingKey = `${r.docId}:${r.zeile}`;
                      return (
                        <TransferCardItem
                          key={`heute-${pendingKey}`}
                          row={r}
                          showErledigt
                          erledigtDisabled={erledigtPending === pendingKey}
                          onToggleErledigt={() =>
                            void toggleErledigt(r.docId, r.zeile, !!r.erledigt)
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="panel board-overview-card">
                <div className="board-overview-card-head">
                  <div>
                    <h2>Kühlräume</h2>
                    <p>
                      {belegtKuehlraeume} von {kuehlraumBelegung.plaetze} belegt
                    </p>
                  </div>
                  <button
                    type="button"
                    className="board-overview-link"
                    onClick={() => goToSection('lager')}
                  >
                    Lager →
                  </button>
                </div>
                {kuehlraumGrids.map(({ cfg, slots }) => (
                  <div key={cfg.id} className="board-overview-kr-block">
                    <p className="board-overview-kr-label">{cfg.label}</p>
                    <div
                      className="cool-grid board-overview-cool"
                      style={{
                        gridTemplateColumns: `repeat(${cfg.plaetze}, minmax(0, 1fr))`,
                      }}
                    >
                      {slots.map((fall, i) => (
                        <div
                          key={i}
                          className={`cool-cell ${fall ? 'occupied' : 'free'}`}
                        >
                          <span className="cool-cell-nr">{i + 1}</span>
                          {fall ? (
                            <span className="cool-cell-name">
                              {fall.verstorbenerName || fall.sterbefallId}
                            </span>
                          ) : (
                            <span className="cool-cell-free">Frei</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>

              <section className="panel board-overview-card">
                <div className="board-overview-card-head">
                  <h2>Aktivität</h2>
                </div>
                <ul className="feed-list board-overview-feed">
                  {events.slice(0, 5).map((ev) => (
                    <li key={ev.id}>
                      <span className="feed-type">{ev.type}</span>
                      <span className="feed-detail">
                        {ev.sterbefallId}
                        {ev.aktuellePosition && ` · ${ev.aktuellePosition}`}
                      </span>
                    </li>
                  ))}
                  {events.length === 0 && (
                    <li className="feed-empty">Noch keine Events</li>
                  )}
                </ul>
              </section>

              <section className="panel board-overview-card">
                <h2>Schnellzugriff</h2>
                <p className="board-overview-meta-text">
                  {sterbefaelle.length} aktive Fälle · {stats.offen} offene Schritte
                </p>
                <div className="board-overview-actions">
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    onClick={() => goToSection('faelle')}
                  >
                    Alle Fälle
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    onClick={() => goToSection('einstellungen')}
                  >
                    Erkennung & Kühlraum
                  </button>
                  <Link to="/wall" className="btn-ghost btn-small">
                    Wandmonitor
                  </Link>
                </div>
              </section>
            </div>
          </div>
        )}

        {section === 'ueberfuehrungen' && (
          <section className="panel panel-primary">
            <div className="panel-head">
              <div>
                <h2>Offene Überführungen</h2>
                {!isNarrow && (
                  <p>Abholung · Überführung · Kremation nach Überführungsorten</p>
                )}
              </div>
              <div className="filter-tabs" role="tablist">
                {(['alle', 'heute', 'abholung'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filter === f}
                    className={filter === f ? 'filter-tab active' : 'filter-tab'}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'alle' ? 'Alle' : f === 'heute' ? 'Heute' : 'Abholung'}
                  </button>
                ))}
              </div>
            </div>

            {erledigtError && (
              <p className="board-inline-error" role="alert">
                {erledigtError}
              </p>
            )}
            {loading && sterbefaelle.length === 0 ? (
              <div className="empty-state">Lade Fälle…</div>
            ) : filteredOffene.length === 0 ? (
              <div className="empty-state">Keine offenen Schritte in dieser Ansicht.</div>
            ) : (
              <div className="transfer-list">
                {filteredOffene.map((r) => {
                  const pendingKey = `${r.docId}:${r.zeile}`;
                  return (
                    <TransferCardItem
                      key={pendingKey}
                      row={r}
                      showErledigt={filter === 'heute'}
                      erledigtDisabled={erledigtPending === pendingKey}
                      onToggleErledigt={
                        filter === 'heute'
                          ? () =>
                              void toggleErledigt(
                                r.docId,
                                r.zeile,
                                !!r.erledigt
                              )
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {section === 'lager' && (
          <div className="board-lager">
            {abschluss.error && (
              <p className="board-inline-error board-lager-error" role="alert">
                {abschluss.error}
              </p>
            )}
            <div className="board-lager-kr-row">
              {kuehlraumGrids.map(({ cfg, slots }) => {
                const belegt = slots.filter(Boolean).length;
                const pct = cfg.plaetze > 0 ? Math.round((belegt / cfg.plaetze) * 100) : 0;
                const roomHasMatch =
                  !lagerSearchActive ||
                  slots.some((f) => f && matchSterbefallQuery(f, searchQuery));
                if (lagerSearchActive && !roomHasMatch) return null;
                return (
                  <section key={cfg.id} className="panel kr-lager-panel">
                    <div className="panel-head compact kr-lager-head">
                      <div>
                        <h2>{cfg.label}</h2>
                        <p title="Ziehen zum Verschieben, + für Details">
                          {belegt}/{cfg.plaetze} belegt
                        </p>
                      </div>
                      <div className="kr-lager-meter" aria-hidden>
                        <div className="kr-lager-meter-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <KuehlraumPlatzGrid
                      cfg={cfg}
                      slots={slots}
                      now={calendarNow}
                      lagerSearchActive={lagerSearchActive}
                      expandedKrKey={expandedKrKey}
                      abschlussPendingId={abschluss.pendingId}
                      matchFall={(fall) => matchSterbefallQuery(fall, searchQuery)}
                      onToggleExpand={(key) =>
                        setExpandedKrKey((prev) => (prev === key ? null : key))
                      }
                      onAbschliessen={(fall) => abschluss.open(fall)}
                    />
                  </section>
                );
              })}
            </div>

            <UrnenBereichPanel
              liste={urnenListe}
              pendingDocId={urnenPending}
              onUndo={(id) => void handleUrnenUndo(id)}
              variant="board"
              compact
            />

            {andereKuehlraeume.length > 0 && (
              <section className="panel">
                <div className="panel-head compact">
                  <h2>Weitere Kühlräume</h2>
                </div>
                <div className="mini-kr-list">
                  {andereKuehlraeume.map(([kr, faelle]) => (
                    <div key={kr} className="mini-kr">
                      <span className="mini-kr-title">{kr}</span>
                      {faelle.map((s) => (
                        <div key={s.id} className="mini-kr-row">
                          <strong>{s.verstorbenerName || s.sterbefallId}</strong>
                          <span>{s.aktuellePosition}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {urnenListe.length === 0 && andereKuehlraeume.length === 0 && belegtKuehlraeume === 0 && (
              <p className="empty-state">Keine Belegung in Lagerbereichen.</p>
            )}
          </div>
        )}

        {section === 'faelle' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Alle Fälle</h2>
                {!isNarrow && (
                  <p>Verlauf und Endziel — Erde: Beisetzung · Urne: Krematorium</p>
                )}
              </div>
            </div>
            {removeError && (
              <p className="board-remove-error" role="alert">
                {removeError}
              </p>
            )}
            {faelleFiltered.length === 0 ? (
              <div className="empty-state">
                {searchQuery.trim() || faelleFilter !== 'alle'
                  ? 'Keine Fälle in dieser Ansicht.'
                  : 'Keine aktiven Fälle.'}
              </div>
            ) : (
              <div className="case-list">
                {faelleFiltered.map((s) => {
                  const open = expandedId === s.id;
                  const imKr = isImEigenenKuehlraum(s);
                  const abgeschlossen = istInHistory(s);
                  return (
                    <div
                      key={s.id}
                      className={[
                        'case-card',
                        open ? 'open' : '',
                        imKr ? 'in-kuehlraum' : '',
                        abgeschlossen ? 'is-abgeschlossen' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className="case-card-header">
                        <button
                          type="button"
                          className="case-card-trigger"
                          onClick={() => setExpandedId(open ? null : s.id)}
                          aria-expanded={open}
                        >
                          <div className="case-card-main">
                            <span className="case-name">{s.verstorbenerName || s.sterbefallId}</span>
                            <span className="case-id">{s.sterbefallId}</span>
                          </div>
                          <div className="case-card-tags">
                            {abgeschlossen && (
                              <span className="chip chip-muted">
                                {fallAbschlussGrundLabel(s.historieGrund ?? s.abschlussGrund)}
                              </span>
                            )}
                            {s.istNeuerFall && !abgeschlossen && (
                              <span className="chip chip-abholung">Neu</span>
                            )}
                            {imKr && !abgeschlossen && (
                              <span className="chip chip-muted">Kühlraum</span>
                            )}
                          </div>
                          <div className="case-card-meta">
                            <span className="case-position">{s.aktuellePosition ?? '—'}</span>
                            {s.endziel && (
                              <EndzielChip typ={s.endzielTyp} ort={s.endziel} />
                            )}
                          </div>
                          <span className="case-chevron" aria-hidden />
                        </button>
                        {!abgeschlossen && (
                          <button
                            type="button"
                            className="case-abschluss-btn"
                            disabled={abschluss.pendingId === s.id}
                            onClick={() => abschluss.open(s)}
                          >
                            {abschluss.pendingId === s.id ? '…' : 'Abschließen'}
                          </button>
                        )}
                      </div>
                      {open && (
                        <div className="case-timeline">
                          {(s.verlauf ?? []).map((v) => (
                            <div key={v.nummer} className={`timeline-step typ-${v.typ}`}>
                              <div className="timeline-dot" />
                              <div className="timeline-body">
                                <div className="timeline-head">
                                  <SchrittBadge typ={v.typ} />
                                  {(v.terminAm ?? v.abholungAm) && (
                                    <time>{v.terminAm ?? v.abholungAm}</time>
                                  )}
                                </div>
                                <p>
                                  {v.vonOrt && v.nachOrt
                                    ? `${v.vonOrt} → ${v.nachOrt}`
                                    : v.ort}
                                </p>
                              </div>
                            </div>
                          ))}
                          <div className="case-timeline-foot">
                            <button
                              type="button"
                              className="case-remove-link"
                              disabled={removePending === s.id}
                              onClick={() => void handleRemoveFromDisposition(s)}
                            >
                              {removePending === s.id
                                ? 'Entfernen…'
                                : 'Als Testfall aus Disposition entfernen'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {section === 'einstellungen' && (
          <section className="board-settings-section">
            <DispositionSettingsPanel defaultOpen />
          </section>
        )}
      </main>

      <FallAbschlussDialog
        fall={abschluss.target}
        pending={!!abschluss.pendingId}
        error={abschluss.error}
        onClose={abschluss.close}
        onConfirm={(grund, bemerkung) => void abschluss.confirm(grund, bemerkung)}
      />
    </div>
  );
}


