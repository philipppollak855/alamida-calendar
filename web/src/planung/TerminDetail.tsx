import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { KATEGORIEN, checkliste, fallDaten, ketteVon, mapsLink, type Termin, type Warnung } from './planungLogic';
import { maxPersonen, personName } from '../shared/einteilung';
import type { EinteilungRecht } from './api';

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

function PersonalBlock({
  termin,
  alle,
  einteilung,
  onEinteilen,
}: {
  termin: Termin;
  alle: Termin[];
  einteilung: EinteilungRecht | null;
  onEinteilen: (t: Termin, emails: string[]) => Promise<void>;
}) {
  const aktuell = (termin.personal ?? []).map((p) => p.email);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [wahl, setWahl] = useState<string[]>(aktuell);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const schluessel = `${termin.id}|${aktuell.join(',')}`;
  useEffect(() => {
    setWahl(schluessel.split('|')[1] ? schluessel.split('|')[1].split(',') : []);
    setFehler(null);
  }, [schluessel]);
  useEffect(() => setBearbeiten(false), [termin.id]);

  const darf = !!einteilung?.darf;
  if (!darf && !aktuell.length) return null;
  // Zusammenhängende Termine (z. B. Überführung → Rosenkranz → Beisetzung) bekommen ein gemeinsames Personal.
  const gruppe = ketteVon(alle, termin) ?? [termin];
  const ids = new Set(gruppe.map((t) => t.id));
  const max = Math.min(...gruppe.map((t) => maxPersonen(t.kategorie)));
  const von = gruppe[0].start;
  const bis = new Date(Math.max(...gruppe.map((t) => t.ende.getTime())));
  const gleich = (t: Termin) => (t.personal ?? []).map((p) => p.email).sort().join(',') === [...aktuell].sort().join(',');
  // Zeitgleich anderswo eingeteilt?
  const konflikt = (email: string) => alle.find((t) => !ids.has(t.id) && t.start < bis && t.ende > von && t.personal?.some((p) => p.email === email));
  const extern = (email: string) => einteilung?.personen.find((p) => p.email === email)?.extern;
  const umschalten = (email: string) => {
    if (wahl.includes(email)) setWahl(wahl.filter((x) => x !== email));
    else if (max === 1) setWahl([email]);
    else if (wahl.length < max) setWahl([...wahl, email]);
  };
  async function speichern() {
    setLaeuft(true);
    setFehler(null);
    try {
      for (const t of gruppe) await onEinteilen(t, wahl);
      setBearbeiten(false);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section className="modal-block">
      <h3>
        Personal <span className="klein">{max === 1 ? '(1 Person)' : `(bis ${max} Personen)`}</span>
      </h3>
      {gruppe.length > 1 && (
        <p className="klein">
          Gilt für alle {gruppe.length} zusammenhängenden Termine: {gruppe.map((t) => `${format(t.start, 'HH:mm')} ${KATEGORIEN[t.kategorie].label}`).join(' → ')}
          {!gruppe.every(gleich) && ' · ⚠️ derzeit unterschiedlich eingeteilt, beim Speichern gilt die Auswahl für alle'}
        </p>
      )}
      {!bearbeiten && (
        <div className="personal-chips">
          {(termin.personal ?? []).map((p) => (
            <span key={p.email} className="personal-chip">
              👤 {personName(p)}
              {extern(p.email) && <span className="klein"> (extern)</span>}
              {konflikt(p.email) && <span title={`Zeitgleich: ${konflikt(p.email)!.titel}`}> ⚠️</span>}
            </span>
          ))}
          {!aktuell.length && <span className="klein">Noch niemand eingeteilt.</span>}
          {darf && (
            <button className="knopf" onClick={() => setBearbeiten(true)}>
              {aktuell.length ? 'Ändern' : 'Personal einteilen'}
            </button>
          )}
        </div>
      )}
      {bearbeiten && einteilung && (
        <>
          <div className="personal-liste">
            {einteilung.personen.map((p) => {
              const an = wahl.includes(p.email);
              const k = konflikt(p.email);
              return (
                <button
                  key={p.email}
                  className={`personal-wahl ${an ? 'an' : ''}`}
                  disabled={!an && max > 1 && wahl.length >= max}
                  onClick={() => umschalten(p.email)}
                >
                  <span>{an ? '✓' : '○'}</span>
                  <span>
                    {personName(p)}
                    {p.extern && <span className="klein"> · extern</span>}
                  </span>
                  {k && <span className="klein warnung-text">⚠️ zeitgleich: {k.verstorbener ?? k.titel}</span>}
                </button>
              );
            })}
          </div>
          {fehler && <div className="warnung">{fehler}</div>}
          <div className="aktionen">
            <button className="knopf primaer" disabled={laeuft} onClick={() => void speichern()}>
              {laeuft ? 'Speichert …' : `Speichern (${wahl.length}/${max})`}
            </button>
            <button className="knopf" disabled={laeuft} onClick={() => setBearbeiten(false)}>
              Abbrechen
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default function TerminDetail({
  termin,
  alle,
  hinweise,
  einteilung = null,
  onEinteilen,
  onLoeschen,
  onWaehlen,
  onSchliessen,
}: {
  termin: Termin;
  alle: Termin[];
  hinweise: Warnung[];
  einteilung?: EinteilungRecht | null;
  onEinteilen?: (t: Termin, emails: string[]) => Promise<void>;
  onLoeschen?: (t: Termin) => Promise<void>;
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

          {onEinteilen && <PersonalBlock termin={termin} alle={alle} einteilung={einteilung} onEinteilen={onEinteilen} />}

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
          {onLoeschen && (
            <div className="aktionen">
              <button className="knopf rot" onClick={() => void onLoeschen(termin).catch((e: Error) => alert(e.message))}>
                Termin löschen
              </button>
            </div>
          )}
          <p className="klein modal-fuss">Kalender: {termin.kalenderName}</p>
        </div>
      </div>
    </div>
  );
}
