import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LiveIndicator } from '../components/LiveIndicator';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useCalendarDay } from '../hooks/useCalendarDay';
import { useSterbefaelle } from '../hooks/useSterbefaelle';
import { firebaseConfigured } from '../firebase';
import { buildAlleEigeneKuehlraumSlots, flattenOffene, kuehlraumGesamtBelegung } from '../board/boardUtils';
import { filterKuehlraeumeFuerWandTab } from '../board/kuehlraumWandTab';
import { wallKuehlraumGridLayout } from '../board/wallKuehlraumLayout';
import { useSubTabRotation } from '../hooks/useSubTabRotation';
import { useDispositionSettings } from '../settings/SettingsProvider';
import { filterAktiveSterbefaelle, filterSterbefaelleFuerKalender } from '../board/historieLogic';
import {
  buildExternGruppen,
  externGesamt,
  externKategorieBadgeLabel,
  externKategorieHatFreigabe,
} from '../board/wallExternUtils';
import { UrnenBereichPanel } from '../components/UrnenBereichPanel';
import { KuehlraumTerminMarker } from '../components/KuehlraumTerminMarker';
import { buildUrnenListe } from '../board/urnenLogic';
import {
  clearSterbefallUrnenRetour,
  markSterbefallUrnenRetour,
} from '../services/urnenRetour';
import {
  clearSterbefallFreigabe,
  setSterbefallFreigabe,
} from '../services/sterbefallFreigabe';
import {
  useWallTabRotation,
  wallDurationsFromSettings,
  WALL_VIEWS,
  type WallView,
} from '../hooks/useWallTabRotation';
import { SchrittBadge } from '../ui/SchrittBadge';
import { RouteFlow } from '../ui/RouteFlow';
import { WallCalendarPanel, wallCalendarTabCount } from '../components/WallCalendarPanel';
import { WallHeuteFeierRow } from '../components/WallHeuteFeierRow';
import { buildWallFeierEntriesForDay } from '../board/wallCalendar';
import { WallFreigabeControl } from '../components/WallFreigabeControl';
import { WallFallAbschlussBtn } from '../components/WallFallAbschlussBtn';
import { FallAbschlussDialog } from '../components/FallAbschlussDialog';
import { useFallAbschluss } from '../hooks/useFallAbschluss';
import { freigabePersonCssClass, istFreigabeWirksam } from '../board/freigabeLogic';
import { WallUeberfuehrungErledigtBtn } from '../components/WallUeberfuehrungErledigtBtn';
import { getErledigteZeilen } from '../board/ueberfuehrungErledigt';
import { toggleUeberfuehrungErledigt } from '../services/ueberfuehrungErledigt';
import { useNarrowViewport } from '../hooks/useNarrowViewport';
import { useScreenWakeLock } from '../hooks/useScreenWakeLock';
import { useWallClock } from '../hooks/useWallClock';
import { useWallEdgeSwipe } from '../hooks/useWallEdgeSwipe';
import type { Sterbefall } from '../types';

const WALL_TAB_LABELS: Record<WallView, string> = {
  kuehlraum: 'Kühlraum',
  extern: 'Extern',
  kalender: 'Kalender',
  abholungen: 'Heute',
  offen: 'Offen',
};

function formatWallTabLabel(
  v: WallView,
  narrow: boolean,
  counts: {
    belegt: number;
    plaetze: number;
    urnen: number;
    extern: number;
    kalender: number;
    heute: number;
    offen: number;
  }
): string {
  if (!narrow) {
    if (v === 'kuehlraum') {
      return `Kühlraum (${counts.belegt}/${counts.plaetze}${counts.urnen > 0 ? ` · ${counts.urnen} Urnen` : ''})`;
    }
    if (v === 'extern') return `Extern (${counts.extern})`;
    if (v === 'kalender') return `Kalender (${counts.kalender})`;
    if (v === 'abholungen') return `Heute (${counts.heute})`;
    return `Offen (${counts.offen})`;
  }
  switch (v) {
    case 'kuehlraum':
      return `Kühlr. ${counts.belegt}/${counts.plaetze}`;
    case 'extern':
      return `Extern ${counts.extern}`;
    case 'kalender':
      return `Kal. ${counts.kalender}`;
    case 'abholungen':
      return `Heute ${counts.heute}`;
    default:
      return `Offen ${counts.offen}`;
  }
}

function WallKuehlraumSubNav({
  labels,
  activeIndex,
  secondsLeft,
  auto,
  onSelect,
}: {
  labels: string[];
  activeIndex: number;
  secondsLeft: number;
  auto: boolean;
  onSelect: (index: number) => void;
}) {
  if (labels.length <= 1) return null;
  return (
    <div className="wall-kr-subnav" role="tablist" aria-label="Kühlräume">
      {labels.map((label, i) => (
        <button
          key={label + i}
          type="button"
          role="tab"
          aria-selected={i === activeIndex}
          className={`wall-kr-subtab ${i === activeIndex ? 'active' : ''} ${auto && i === activeIndex ? 'auto' : ''}`}
          onClick={() => onSelect(i)}
        >
          <span className="wall-kr-subtab-label">{label}</span>
          {i === activeIndex && auto && (
            <span className="wall-kr-subtab-timer">{secondsLeft}s</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function WallPage({
  publicAccess = false,
  legacyMode = false,
}: {
  publicAccess?: boolean;
  legacyMode?: boolean;
}) {
  const { settings } = useDispositionSettings();
  const { signOut, status: authStatus } = useAuth();
  const canDispositionWrite = !publicAccess && authStatus === 'activated';
  const abschluss = useFallAbschluss();
  const isNarrow = useNarrowViewport();
  useScreenWakeLock(!isNarrow);
  const now = useWallClock(legacyMode ? 30_000 : 1000);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [urnenPending, setUrnenPending] = useState<string | null>(null);
  const [freigabePending, setFreigabePending] = useState<string | null>(null);
  const [erledigtPending, setErledigtPending] = useState<string | null>(null);
  const [externActionError, setExternActionError] = useState<string | null>(null);
  const tabDurations = useMemo(
    () => wallDurationsFromSettings(settings.wallTabWechselSekunden),
    [settings.wallTabWechselSekunden]
  );
  const activeViews = useMemo(() => {
    const enabled = settings.wallTabRotationEnabled;
    const selected = WALL_VIEWS.filter((v) => enabled?.[v] ?? true);
    return selected.length > 0 ? selected : [WALL_VIEWS[0]];
  }, [settings.wallTabRotationEnabled]);
  const { slide, view, secondsLeft, goToSlide, rotationOff } = useWallTabRotation(
    tabDurations,
    rotationPaused,
    !isNarrow,
    activeViews
  );
  const edgeSwipe = useWallEdgeSwipe(isNarrow, slide, goToSlide);

  const { items: sterbefaelleRaw, lastSyncAt, isLive, loading } = useSterbefaelle();
  const calendarDay = useCalendarDay();
  const calendarAnchorDate = useMemo(() => {
    const [y, m, d] = calendarDay.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [calendarDay]);
  const sterbefaelle = useMemo(
    () => filterAktiveSterbefaelle(sterbefaelleRaw),
    [sterbefaelleRaw]
  );
  const sterbefaelleKalender = useMemo(
    () => filterSterbefaelleFuerKalender(sterbefaelleRaw),
    [sterbefaelleRaw]
  );
  const kalenderTermine7d = useMemo(
    () => wallCalendarTabCount(sterbefaelleKalender, calendarAnchorDate),
    [sterbefaelleKalender, calendarAnchorDate]
  );

  const kuehlraeumeWandKuehlraum = useMemo(
    () => filterKuehlraeumeFuerWandTab(settings.eigeneKuehlraeume, 'kuehlraum'),
    [settings.eigeneKuehlraeume]
  );
  const kuehlraumGrids = useMemo(
    () => buildAlleEigeneKuehlraumSlots(sterbefaelle, kuehlraeumeWandKuehlraum),
    [sterbefaelle, kuehlraeumeWandKuehlraum]
  );
  const kuehlraumBelegung = useMemo(
    () => kuehlraumGesamtBelegung(kuehlraumGrids),
    [kuehlraumGrids]
  );
  const kuehlraumIds = useMemo(
    () => kuehlraeumeWandKuehlraum.map((k) => k.id),
    [kuehlraeumeWandKuehlraum]
  );
  const kuehlraumLabels = useMemo(
    () => kuehlraeumeWandKuehlraum.map((k) => k.label),
    [kuehlraeumeWandKuehlraum]
  );
  const kuehlraumSub = useSubTabRotation(
    kuehlraumIds,
    tabDurations.kuehlraum,
    view === 'kuehlraum' && !rotationOff,
    rotationPaused
  );
  const activeKuehlraumGrid = useMemo(() => {
    const idx = Math.max(0, kuehlraumGrids.findIndex((g) => g.cfg.id === kuehlraumSub.activeId));
    return kuehlraumGrids[idx >= 0 ? idx : 0] ?? kuehlraumGrids[0];
  }, [kuehlraumGrids, kuehlraumSub.activeId]);
  const externGruppen = useMemo(
    () => buildExternGruppen(sterbefaelle, { settings }),
    [sterbefaelle, settings]
  );
  const externTotal = useMemo(() => externGesamt(externGruppen), [externGruppen]);
  const offene = useMemo(() => flattenOffene(sterbefaelle), [sterbefaelle, calendarDay]);
  const heuteOffen = useMemo(() => offene.filter((o) => o.status === 'heute'), [offene, calendarDay]);
  const heuteFeier = useMemo(
    () => buildWallFeierEntriesForDay(sterbefaelleKalender, calendarDay),
    [sterbefaelleKalender, calendarDay]
  );
  const heuteTermineCount = heuteFeier.length + heuteOffen.length;
  const sterbefallByDocId = useMemo(
    () => new Map(sterbefaelle.map((s) => [s.id, s])),
    [sterbefaelle]
  );
  const belegt = kuehlraumBelegung.belegt;
  const kuehlraumPlaetze = kuehlraumBelegung.plaetze;
  const urnenListe = useMemo(() => buildUrnenListe(sterbefaelle), [sterbefaelle]);

  async function handleRetour(docId: string, retourVon?: string) {
    setExternActionError(null);
    setUrnenPending(docId);
    try {
      await markSterbefallUrnenRetour(docId, retourVon);
    } catch (e) {
      setExternActionError(e instanceof Error ? e.message : 'Retour fehlgeschlagen');
    } finally {
      setUrnenPending(null);
    }
  }

  async function handleUrnenUndo(docId: string) {
    setExternActionError(null);
    setUrnenPending(docId);
    try {
      await clearSterbefallUrnenRetour(docId);
    } catch (e) {
      setExternActionError(e instanceof Error ? e.message : 'Rückgängig fehlgeschlagen');
    } finally {
      setUrnenPending(null);
    }
  }

  async function saveFreigabe(docId: string, datumDe: string) {
    setExternActionError(null);
    setFreigabePending(docId);
    try {
      await setSterbefallFreigabe(docId, datumDe);
    } catch (e) {
      setExternActionError(e instanceof Error ? e.message : 'Freigabe fehlgeschlagen');
    } finally {
      setFreigabePending(null);
    }
  }

  async function clearFreigabe(docId: string) {
    setExternActionError(null);
    setFreigabePending(docId);
    try {
      await clearSterbefallFreigabe(docId);
    } catch (e) {
      setExternActionError(e instanceof Error ? e.message : 'Freigabe fehlgeschlagen');
    } finally {
      setFreigabePending(null);
    }
  }

  async function toggleErledigt(
    docId: string,
    zeile: number,
    currentlyErledigt: boolean
  ) {
    const key = `${docId}:${zeile}`;
    setExternActionError(null);
    setErledigtPending(key);
    try {
      const s = sterbefallByDocId.get(docId);
      const zeilen = s ? getErledigteZeilen(s) : [];
      await toggleUeberfuehrungErledigt(docId, zeile, zeilen, currentlyErledigt);
    } catch (e) {
      setExternActionError(
        e instanceof Error ? e.message : 'Erledigt-Markierung fehlgeschlagen'
      );
    } finally {
      setErledigtPending(null);
    }
  }

  if (!firebaseConfigured) {
    return (
      <div className="wall">
        <p className="wall-error">Firebase nicht konfiguriert</p>
      </div>
    );
  }

  const timeStr = now.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    ...(legacyMode ? {} : { second: '2-digit' }),
  });
  const dateStr = now.toLocaleDateString('de-AT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div
      className={`wall ${legacyMode ? 'wall--legacy' : ''}${isNarrow ? ' wall--mobile' : ''}`}
    >
      <div className="wall-bg" aria-hidden />
      <header className="wall-topbar">
        <div className="wall-brand" aria-label="Alamida Monitoring">
          <span className="brand-mark" />
          {!isNarrow && (
            <div>
              <span className="wall-brand-title">Alamida Monitoring</span>
              <span className="wall-brand-sub">Wandmonitor · Live</span>
            </div>
          )}
        </div>
        <div className="wall-clock">
          <span className="wall-time">{timeStr}</span>
          <span className="wall-date">{dateStr}</span>
        </div>
        <div className="wall-topbar-end">
          {!legacyMode && <ThemeSwitch />}
          <LiveIndicator
            isLive={isLive}
            lastSyncAt={lastSyncAt}
            loading={loading}
            label="Live"
            hideSyncAge
          />
          {!legacyMode && !rotationOff && !isNarrow && (
            <span className="wall-tab-countdown wall-tab-countdown--desktop" title="Zeit bis zum nächsten Tab">
              Tabwechsel in {secondsLeft}s
            </span>
          )}
          {!publicAccess && (
            <Link
              to="/disposition"
              className={`wall-link ${isNarrow ? 'wall-link--dispo' : ''}`}
            >
              {isNarrow ? 'Dispo' : 'Disposition'}
            </Link>
          )}
          {!publicAccess && (
            <button type="button" className="btn-ghost btn-small" onClick={() => signOut()}>
              Abmelden
            </button>
          )}
        </div>
      </header>

      <div
        className={`wall-view-tabs ${isNarrow ? 'wall-view-tabs--one-row wall-view-tabs--mobile-bar' : ''}`}
        role="tablist"
        aria-label="Wandansichten"
      >
        {activeViews.map((v, i) => (
          <button
            key={v}
            type="button"
            className={`wall-view-tab ${view === v ? 'active' : ''} ${!rotationOff && slide === i ? 'auto' : ''}`}
            title={WALL_TAB_LABELS[v]}
            onClick={() => goToSlide(i)}
          >
            {formatWallTabLabel(v, isNarrow, {
              belegt,
              plaetze: kuehlraumPlaetze,
              urnen: urnenListe.length,
              extern: externTotal,
              kalender: kalenderTermine7d,
              heute: heuteTermineCount,
              offen: offene.length,
            })}
          </button>
        ))}
      </div>

      <div className={`wall-stage ${isNarrow ? 'wall-stage--edge-swipe' : ''}`}>
        {isNarrow && (
          <>
            <div
              className="wall-edge-swipe wall-edge-swipe--left"
              aria-hidden
              {...edgeSwipe}
            />
            <div
              className="wall-edge-swipe wall-edge-swipe--right"
              aria-hidden
              {...edgeSwipe}
            />
          </>
        )}
        {view === 'kuehlraum' && kuehlraeumeWandKuehlraum.length === 0 && (
          <p className="wall-empty">Kein Kühlraum für den Tab „Kühlraum“ konfiguriert.</p>
        )}
        {view === 'kuehlraum' && kuehlraeumeWandKuehlraum.length > 0 && activeKuehlraumGrid && (
          <div
            className={`wall-kuehlraum-stage ${kuehlraumIds.length > 1 ? 'wall-kuehlraum-stage--rotate' : ''}`}
          >
            <WallKuehlraumSubNav
              labels={kuehlraumLabels}
              activeIndex={kuehlraumSub.slide}
              secondsLeft={kuehlraumSub.secondsLeft}
              auto={!kuehlraumSub.rotationOff}
              onSelect={kuehlraumSub.goToSlide}
            />
            {(() => {
              const { cfg, slots } = activeKuehlraumGrid;
              const urnenSichtbar = urnenListe.length > 0;
              const { cols, rows } = wallKuehlraumGridLayout(cfg.plaetze, { urnenSichtbar });
              return (
                <>
                  <h2 className="wall-stage-title">{cfg.label}</h2>
                  <div
                    className="wall-cool-grid"
                    style={
                      {
                        '--kr-cols': cols,
                        '--kr-rows': rows,
                      } as React.CSSProperties
                    }
                  >
                    {slots.map((fall, i) => (
                      <div
                        key={i}
                        className={`wall-cool-tile ${fall ? 'on' : 'off'} ${
                          fall
                            ? freigabePersonCssClass(fall.freigabeFrei, fall.freigabeDatum, now)
                            : ''
                        }`}
                      >
                        <span className="wall-tile-nr">Platz {i + 1}</span>
                        {fall ? (
                          <>
                            <span className="wall-tile-name">
                              {fall.verstorbenerName || fall.sterbefallId}
                            </span>
                            <span className="wall-tile-pos">{fall.aktuellePosition}</span>
                            {fall.freigabeFrei && fall.freigabeDatum && (
                              <span className="wall-tile-freigabe-hint">
                                {istFreigabeWirksam(fall.freigabeFrei, fall.freigabeDatum, now)
                                  ? `Freigabe ${fall.freigabeDatum}`
                                  : `Freigabe ab ${fall.freigabeDatum}`}
                              </span>
                            )}
                            <div className="wall-cool-tile-footer">
                              <KuehlraumTerminMarker
                                fall={fall}
                                now={now}
                                className="wall-cool-termin-marker"
                              />
                              <WallFreigabeControl
                                docId={fall.id}
                                freigabeFrei={fall.freigabeFrei}
                                freigabeDatum={fall.freigabeDatum}
                                defaultDate={now}
                                disabled={freigabePending === fall.id}
                                onSave={saveFreigabe}
                                onClear={clearFreigabe}
                              />
                              {canDispositionWrite && (
                                <WallFallAbschlussBtn
                                  pending={abschluss.pendingId === fall.id}
                                  disabled={freigabePending === fall.id}
                                  onClick={() => abschluss.open(fall)}
                                />
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="wall-tile-free">Frei</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {urnenListe.length > 0 && (
              <UrnenBereichPanel
                liste={urnenListe}
                pendingDocId={urnenPending}
                onUndo={(id) => void handleUrnenUndo(id)}
                variant="wall"
              />
            )}
          </div>
        )}

        {view === 'extern' && (
          <div className="wall-extern-stage">
            <h2 className="wall-stage-title">Extern — Krankenhäuser & Kremation</h2>
            <p className="wall-stage-sub">
              Verstorbene außerhalb des Firmenkühlraums, noch am Sterbeort oder im
              Krematorium
            </p>
            {externActionError && (
              <p className="wall-retour-error" role="alert">
                {externActionError}
              </p>
            )}
            {externGruppen.length === 0 ? (
              <p className="wall-empty">Keine externen Verstorbenen</p>
            ) : (
              <div className="wall-extern-grid">
                {externGruppen.map((g) => (
                  <article
                    key={g.key}
                    className={`wall-extern-card wall-extern-card--${g.typ}`}
                  >
                    <header className="wall-extern-card-head">
                      <span className={`wall-extern-badge wall-extern-badge--${g.typ}`}>
                        {externKategorieBadgeLabel(g.typ)}
                      </span>
                      <h3 className="wall-extern-ort">{g.ort}</h3>
                      <span className="wall-extern-count">{g.faelle.length}</span>
                    </header>
                    <ul className="wall-extern-list">
                      {g.faelle.map((f) => (
                        <li
                          key={f.docId}
                          className={`wall-extern-person ${
                            externKategorieHatFreigabe(g.typ)
                              ? freigabePersonCssClass(f.freigabeFrei, f.freigabeDatum, now)
                              : ''
                          }`}
                        >
                          <div className="wall-extern-person-main">
                            <span className="wall-extern-name">{f.name}</span>
                            <span className="wall-extern-meta">
                              {f.hinweis}
                              {f.terminAm ? ` · ${f.terminAm}` : ''}
                              {externKategorieHatFreigabe(g.typ) &&
                              f.freigabeFrei &&
                              f.freigabeDatum
                                ? istFreigabeWirksam(f.freigabeFrei, f.freigabeDatum, now)
                                  ? ` · Freigabe ${f.freigabeDatum}`
                                  : ` · Freigabe ab ${f.freigabeDatum}`
                                : ''}
                            </span>
                          </div>
                          <div className="wall-extern-actions">
                            {externKategorieHatFreigabe(g.typ) && (
                              <WallFreigabeControl
                                docId={f.docId}
                                freigabeFrei={f.freigabeFrei}
                                freigabeDatum={f.freigabeDatum}
                                defaultDate={now}
                                disabled={
                                  freigabePending === f.docId || urnenPending === f.docId
                                }
                                onSave={saveFreigabe}
                                onClear={clearFreigabe}
                              />
                            )}
                            {g.typ === 'kremation' && f.kremationRetourErlaubt && (
                              <button
                                type="button"
                                className="wall-retour-btn"
                                disabled={urnenPending === f.docId}
                                title="In Bereich Urnen unter Kühlraum übernehmen"
                                onClick={() => void handleRetour(f.docId, f.kremationOrt)}
                              >
                                {urnenPending === f.docId ? '…' : 'Retour'}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'kalender' && (
          <div className="wall-cal-stage">
            <WallCalendarPanel sterbefaelle={sterbefaelleKalender} now={calendarAnchorDate} />
          </div>
        )}

        {view === 'abholungen' && (
          <div className="wall-list-stage">
            <h2 className="wall-stage-title">Heutige Termine</h2>
            {heuteTermineCount === 0 ? (
              <p className="wall-empty">Keine Termine für heute</p>
            ) : (
              <div className="wall-big-list">
                {heuteFeier.map((e) => (
                  <WallHeuteFeierRow key={e.id} entry={e} />
                ))}
                {heuteOffen.map((r) => {
                  const pendingKey = `${r.docId}:${r.zeile}`;
                  return (
                    <article
                      key={pendingKey}
                      className={`wall-big-row${r.erledigt ? ' is-erledigt' : ''}`}
                    >
                      <time>{r.terminAm}</time>
                      <div className="wall-big-main">
                        <span className="wall-big-name">{r.name}</span>
                        <RouteFlow von={r.vonOrt} nach={r.nachOrt} />
                      </div>
                      <div className="wall-big-row-actions">
                        <SchrittBadge typ={r.schrittTyp} />
                        <WallUeberfuehrungErledigtBtn
                          erledigt={r.erledigt}
                          disabled={erledigtPending === pendingKey}
                          onClick={() =>
                            void toggleErledigt(r.docId, r.zeile, !!r.erledigt)
                          }
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === 'offen' && (
          <div className="wall-list-stage">
            <h2 className="wall-stage-title">Alle offenen Überführungen</h2>
            {offene.length === 0 ? (
              <p className="wall-empty">Keine offenen Schritte</p>
            ) : (
              <div className="wall-big-list scroll">
                {offene.slice(0, 12).map((r, i) => (
                  <article key={i} className="wall-big-row">
                    <time>{r.terminAm}</time>
                    <div className="wall-big-main">
                      <span className="wall-big-name">{r.name}</span>
                      <RouteFlow von={r.vonOrt} nach={r.nachOrt} />
                    </div>
                    <SchrittBadge typ={r.schrittTyp} />
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="wall-footer">
        <div className="wall-progress">
          {activeViews.map((_, i) => (
            <span key={i} className={`wall-progress-dot ${slide === i ? 'on' : ''}`} />
          ))}
        </div>
        <div className="wall-footer-actions">
          {!isNarrow ? (
            <>
              <button
                type="button"
                className={`wall-pause-btn ${rotationPaused ? 'is-paused' : ''}`}
                aria-pressed={rotationPaused}
                onClick={() => setRotationPaused((p) => !p)}
              >
                {rotationPaused ? 'Fortsetzen' : 'Pause'}
              </button>
              <span className="wall-rotate-hint">
                {rotationPaused
                  ? 'Automatischer Wechsel pausiert · Tabs manuell wählbar'
                  : `${WALL_TAB_LABELS[view]}: ${tabDurations[view]}s · als Nächstes ${WALL_TAB_LABELS[activeViews[(slide + 1) % activeViews.length]]}`}
              </span>
            </>
          ) : (
            <span className="wall-rotate-hint wall-rotate-hint--mobile">
              Am linken/rechten Rand wischen zum Tabwechsel
            </span>
          )}
        </div>
      </footer>

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
