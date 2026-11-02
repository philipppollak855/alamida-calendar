import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCalendarDay } from '../hooks/useCalendarDay';
import { useSterbefaelle } from '../hooks/useSterbefaelle';
import { firebaseConfigured } from '../firebase';
import { useDispositionSettings } from '../settings/SettingsProvider';
import { buildWidgetSnapshot, parseWidgetKind, type WidgetKind } from '../widget/widgetData';
const REFRESH_MS = 45_000;

const TITLES: Record<WidgetKind, string> = {
  summary: 'Übersicht',
  kuehlraum: 'Kühlraum',
  extern: 'Extern',
  heute: 'Heute',
};

const LINKS: Record<WidgetKind, string> = {
  summary: '/wall',
  kuehlraum: '/wall',
  extern: '/wall',
  heute: '/wall',
};

export function WidgetPage() {
  useDispositionSettings();
  const { kind: kindParam } = useParams<{ kind: string }>();
  const kind = parseWidgetKind(kindParam);
  const calendarDay = useCalendarDay();
  const { items, lastSyncAt, isLive, loading } = useSterbefaelle();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    document.documentElement.classList.add('widget-mode');
    return () => document.documentElement.classList.remove('widget-mode');
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const snap = useMemo(() => buildWidgetSnapshot(items), [items, tick, calendarDay]);

  if (!firebaseConfigured) {
    return (
      <div className="widget-frame">
        <p className="widget-error">Firebase nicht konfiguriert</p>
      </div>
    );
  }

  const syncStr = lastSyncAt
    ? lastSyncAt.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="widget-frame" data-widget={kind}>
      <header className="widget-head">
        <div className="widget-head-row">
          <span className="widget-title">{TITLES[kind]}</span>
          <span className={`widget-live ${isLive ? 'on' : ''}`} title="Live-Sync">
            {loading ? '…' : syncStr}
          </span>
        </div>
        <Link to={LINKS[kind]} className="widget-open-app">
          App öffnen →
        </Link>
      </header>

      {kind === 'summary' && (
        <div className="widget-summary-grid">
          <div className="widget-stat">
            <span className="widget-stat-n">{snap.belegt}/{snap.plaetze}</span>
            <span className="widget-stat-l">Kühlraum</span>
          </div>
          <div className="widget-stat">
            <span className="widget-stat-n">{snap.externTotal}</span>
            <span className="widget-stat-l">Extern</span>
          </div>
          <div className="widget-stat">
            <span className="widget-stat-n">{snap.stats.heute}</span>
            <span className="widget-stat-l">Heute</span>
          </div>
          <div className="widget-stat">
            <span className="widget-stat-n">{snap.stats.offen}</span>
            <span className="widget-stat-l">Offen</span>
          </div>
        </div>
      )}

      {kind === 'kuehlraum' && (
        <>
          {snap.kuehlraumGrids.map(({ cfg, slots }) => (
            <div key={cfg.id} className="widget-kr-block">
              <p className="widget-sub">{cfg.label}</p>
              <div
                className="widget-kr-grid"
                style={
                  {
                    '--w-cols': 3,
                    '--w-rows': Math.max(1, Math.ceil(cfg.plaetze / 3)),
                  } as React.CSSProperties
                }
              >
                {slots.map((fall, i) => (
                  <div key={i} className={`widget-kr-cell ${fall ? 'on' : 'off'}`}>
                    <span className="widget-kr-nr">{i + 1}</span>
                    {fall ? (
                      <span className="widget-kr-name">
                        {(fall.verstorbenerName ?? fall.sterbefallId ?? '').split(' ')[0]}
                      </span>
                    ) : (
                      <span className="widget-kr-free">·</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {kind === 'extern' && (
        <ul className="widget-list">
          {snap.externGruppen.length === 0 ? (
            <li className="widget-empty-li">Keine externen Fälle</li>
          ) : (
            snap.externGruppen.slice(0, 5).map((g) => (
              <li key={g.key} className="widget-list-item">
                <span className="widget-list-primary">{g.ort}</span>
                <span className="widget-list-badge">{g.faelle.length}</span>
              </li>
            ))
          )}
        </ul>
      )}

      {kind === 'heute' && (
        <ul className="widget-list widget-list--dense">
          {snap.heute.length === 0 ? (
            <li className="widget-empty-li">Keine Termine heute</li>
          ) : (
            snap.heute.map((r, i) => (
              <li key={i} className="widget-list-item widget-list-item--stack">
                <span className="widget-list-primary">{r.name}</span>
                <span className="widget-list-meta">
                  {r.terminAm} · {r.vonOrt} → {r.nachOrt}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
