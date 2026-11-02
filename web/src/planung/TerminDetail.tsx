import { useEffect } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { KATEGORIEN, checkliste, fallDaten, mapsLink, type Termin, type Warnung } from './planungLogic';

const FELDER: [string, string][] = [
  ['sterbedatum', 'Sterbedatum'],
  ['sterbeort', 'Sterbeort'],
  ['bestattungsart', 'Bestattungsart'],
  ['endziel', 'Beisetzungsort'],
  ['kuehlraum', 'Kühlraum'],
  ['position', 'Aktueller Standort'],
];

export function zeitText(t: Termin, mitDatum = true): string {
  const datum = mitDatum ? format(t.start, 'EEEE, d. MMMM yyyy', { locale: de }) + ' · ' : '';
  return datum + (t.ganztaegig ? 'ganztägig' : `${format(t.start, 'HH:mm')}–${format(t.ende, 'HH:mm')} Uhr`);
}

export default function TerminDetail({
  termin,
  alle,
  hinweise,
  onWaehlen,
  onSchliessen,
}: {
  termin: Termin;
  alle: Termin[];
  hinweise: Warnung[];
  onWaehlen: (t: Termin) => void;
  onSchliessen: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onSchliessen();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSchliessen]);

  const k = KATEGORIEN[termin.kategorie];
  const fall = termin.sterbefallId
    ? alle.filter((t) => t.sterbefallId === termin.sterbefallId).sort((a, b) => a.start.getTime() - b.start.getTime())
    : [termin];
  const fd = fallDaten(fall);
  const daten: Record<string, string> = { ...termin.details };
  for (const [key] of FELDER) if (!daten[key] && fd[key]) daten[key] = fd[key];
  const maps = mapsLink(termin);
  const fallHinweise = hinweise.filter((w) => w.termine.some((t) => fall.includes(t)));
  const hatDetails = Object.keys(termin.details).some((x) => !['kategorie', 'sterbefallId', 'alamidaKey'].includes(x));

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-kopf" style={{ background: k.farbe }}>
          <div>
            <div className="modal-kategorie">
              {k.symbol} {daten.art ?? k.label}
            </div>
            <h2>{termin.verstorbener ?? termin.titel}</h2>
            {termin.sterbefallId && <div className="modal-nr">Sterbefall {termin.sterbefallId}</div>}
          </div>
          <button className="modal-zu" onClick={onSchliessen} aria-label="Schließen">
            ✕
          </button>
        </header>

        <div className="modal-inhalt">
          <section className="modal-block">
            <div className="zeile">
              <span>🗓️</span>
              <div>
                {zeitText(termin)}
                {daten.imAnschluss && <div className="klein">im Anschluss an die Trauerfeier</div>}
              </div>
            </div>
            {daten.route ? (
              <div className="zeile">
                <span>🧭</span>
                <div>
                  <strong>{daten.von ?? ''}</strong> → <strong>{daten.nach ?? ''}</strong>
                </div>
              </div>
            ) : (
              termin.ort && (
                <div className="zeile">
                  <span>📍</span>
                  <div>{termin.ort}</div>
                </div>
              )
            )}
            <div className="aktionen">
              {maps && (
                <a className="knopf primaer" href={maps} target="_blank" rel="noreferrer">
                  {daten.route ? 'Route in Google Maps' : 'In Google Maps zeigen'}
                </a>
              )}
              {termin.link && (
                <a className="knopf" href={termin.link} target="_blank" rel="noreferrer">
                  In Google Kalender öffnen
                </a>
              )}
            </div>
          </section>

          {FELDER.some(([key]) => daten[key]) && (
            <section className="modal-block">
              <h3>Sterbefall</h3>
              <dl className="daten">
                {FELDER.filter(([key]) => daten[key]).map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{daten[key]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {termin.sterbefallId && (
            <section className="modal-block">
              <h3>Checkliste</h3>
              <ul className="checkliste">
                {checkliste(fall).map((p) => (
                  <li key={p.label} className={p.erledigt ? 'ok' : 'offen'}>
                    {p.erledigt ? '✓' : '○'} {p.label}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {fallHinweise.length > 0 && (
            <section className="modal-block">
              <h3>Hinweise</h3>
              {fallHinweise.map((w, i) => (
                <div key={i} className={`warnung ${w.art}`}>
                  {w.text}
                </div>
              ))}
            </section>
          )}

          {fall.length > 1 && (
            <section className="modal-block">
              <h3>Alle Termine dieses Sterbefalls</h3>
              <ol className="fall-termine">
                {fall.map((t) => {
                  const kk = KATEGORIEN[t.kategorie];
                  return (
                    <li key={t.id}>
                      <button
                        className={t.id === termin.id ? 'aktuell' : ''}
                        style={{ borderLeftColor: kk.farbe }}
                        onClick={() => onWaehlen(t)}
                      >
                        <span className="klein">{format(t.start, t.ganztaegig ? 'EEE d.M.' : 'EEE d.M. HH:mm', { locale: de })}</span>
                        <span>
                          {kk.symbol} {t.details.art ?? kk.label}
                        </span>
                        <span className="klein">{t.details.route ?? t.ort}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {!hatDetails && termin.beschreibung && (
            <section className="modal-block">
              <h3>Beschreibung</h3>
              <pre className="beschreibung">{termin.beschreibung}</pre>
            </section>
          )}
          <p className="klein modal-fuss">Kalender: {termin.kalenderName}</p>
        </div>
      </div>
    </div>
  );
}
