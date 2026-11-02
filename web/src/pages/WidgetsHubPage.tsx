import { Link } from 'react-router-dom';

const WIDGETS = [
  {
    kind: 'summary',
    title: 'Übersicht',
    desc: 'Kühlraum, Extern, Heute und Offen auf einen Blick.',
  },
  {
    kind: 'kuehlraum',
    title: 'Kühlraum',
    desc: 'Belegung Grafenbach als kompaktes Raster.',
  },
  {
    kind: 'extern',
    title: 'Extern',
    desc: 'Krankenhäuser und Kremation mit Fallzahlen.',
  },
  {
    kind: 'heute',
    title: 'Heute',
    desc: 'Abholungen und Termine für heute.',
  },
] as const;

function widgetUrl(kind: string) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/widget/${kind}`;
}

export function WidgetsHubPage() {
  return (
    <div className="widgets-hub">
      <header className="widgets-hub-head">
        <h1>Widgets</h1>
        <p>
          Kompakte Live-Ansichten für Windows Desktop und Android — ideal für Widget-Board,
          Startbildschirm-Shortcuts oder kleines App-Fenster.
        </p>
        <Link to="/disposition" className="btn-ghost">
          ← Disposition
        </Link>
      </header>

      <section className="panel widgets-hub-grid">
        {WIDGETS.map((w) => (
          <article key={w.kind} className="widgets-hub-card">
            <h2>{w.title}</h2>
            <p>{w.desc}</p>
            <code className="widgets-hub-url">{widgetUrl(w.kind)}</code>
            <div className="widgets-hub-actions">
              <Link to={`/widget/${w.kind}`} className="btn-primary">
                Vorschau
              </Link>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => navigator.clipboard.writeText(widgetUrl(w.kind))}
              >
                Link kopieren
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="panel widgets-hub-help">
        <h2>Windows 11 (Desktop)</h2>
        <ol>
          <li>App als PWA installieren (Chrome/Edge: „App installieren“).</li>
          <li>
            <strong>App-Shortcuts:</strong> Rechtsklick auf das App-Symbol → Kühlraum, Extern
            oder Heute.
          </li>
          <li>
            <strong>Kleines Fenster:</strong> Widget-Link öffnen, Fenster verkleinern und
            „Immer im Vordergrund“ nutzen (optional mit Drittanbieter-Tools).
          </li>
          <li>
            <strong>Widget Board:</strong> Wo eine URL erlaubt ist, einen der Links oben
            einfügen (z. B. Übersicht).
          </li>
        </ol>

        <h2>Android</h2>
        <ol>
          <li>PWA zum Startbildschirm hinzufügen (Chrome: Installieren / Zum Home-Bildschirm).</li>
          <li>
            <strong>App-Shortcuts:</strong> App-Symbol lang drücken → Kühlraum, Extern, Heute.
          </li>
          <li>
            <strong>Web-Widget-Apps</strong> (z. B. KWGT mit „Web“-Element): einen Widget-Link
            als URL eintragen — Ansicht aktualisiert sich live.
          </li>
          <li>
            <strong>App-Badge:</strong> Zahl offener/heute + extern am Icon (wenn vom System
            unterstützt).
          </li>
        </ol>
      </section>
    </div>
  );
}
