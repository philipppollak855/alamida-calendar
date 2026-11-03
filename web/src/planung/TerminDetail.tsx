import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { KATEGORIEN, ablaufGeeignet, ablaufTermine, checkliste, fallDaten, fallSchluessel, mapsLink, type Termin, type Warnung } from './planungLogic';
import { maxPersonen, personName, tagWien } from '../shared/einteilung';
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

type Person = { email: string; name?: string };

function Auswahl({
  einteilung,
  start,
  max,
  konflikt,
  hinweis,
  onSpeichern,
  onAbbrechen,
}: {
  einteilung: EinteilungRecht;
  start: string[];
  max: number;
  konflikt: (email: string) => Termin | undefined;
  hinweis?: string;
  onSpeichern: (emails: string[]) => Promise<void>;
  onAbbrechen: () => void;
}) {
  const [wahl, setWahl] = useState<string[]>(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const umschalten = (email: string) => {
    if (wahl.includes(email)) setWahl(wahl.filter((x) => x !== email));
    else if (max === 1) setWahl([email]);
    else if (wahl.length < max) setWahl([...wahl, email]);
  };
  async function speichern() {
    setLaeuft(true);
    setFehler(null);
    try {
      await onSpeichern(wahl);
      onAbbrechen();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <>
      <div className="personal-liste">
        {einteilung.personen.map((p) => {
          const an = wahl.includes(p.email);
          const k = konflikt(p.email);
          return (
            <button key={p.email} className={`personal-wahl ${an ? 'an' : ''}`} disabled={!an && max > 1 && wahl.length >= max} onClick={() => umschalten(p.email)}>
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
      {hinweis && <p className="klein">{hinweis}</p>}
      {fehler && <div className="warnung">{fehler}</div>}
      <div className="aktionen">
        <button className="knopf primaer" disabled={laeuft} onClick={() => void speichern()}>
          {laeuft ? 'Speichert …' : `Speichern (${wahl.length}/${max})`}
        </button>
        <button className="knopf" disabled={laeuft} onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </>
  );
}

function PersonalBlock({
  termin,
  alle,
  einteilung,
  onEinteilen,
  onAblauf,
}: {
  termin: Termin;
  alle: Termin[];
  einteilung: EinteilungRecht | null;
  onEinteilen: (t: Termin, emails: string[]) => Promise<void>;
  onAblauf?: (fall: string, tag: string, emails: string[]) => Promise<void>;
}) {
  const [modus, setModus] = useState<null | 'ablauf' | 'termin'>(null);
  useEffect(() => setModus(null), [termin.id]);

  const darf = !!einteilung?.darf;
  if (!darf && !termin.personal?.length) return null;
  // Ablauf: alle Untertermine des Falls an diesem Tag teilen sich ein Personal, einzelne können abweichen.
  const ablauf = ablaufTermine(alle, termin);
  const fall = fallSchluessel(termin);
  const mitAblauf = !!onAblauf && !!fall && ablaufGeeignet(termin) && ablauf.length > 1;
  const ids = new Set(mitAblauf ? ablauf.map((t) => t.id) : [termin.id]);
  const konfliktIn = (gruppe: Termin[]) => {
    const von = gruppe[0].start;
    const bis = new Date(Math.max(...gruppe.map((t) => t.ende.getTime())));
    return (email: string) => alle.find((t) => !ids.has(t.id) && t.start < bis && t.ende > von && t.personal?.some((p) => p.email === email));
  };
  const extern = (email: string) => einteilung?.personen.find((p) => p.email === email)?.extern;
  const chips = (personen: Person[], konflikt: (email: string) => Termin | undefined, leer: string) => (
    <>
      {personen.map((p) => (
        <span key={p.email} className="personal-chip">
          👤 {personName(p)}
          {extern(p.email) && <span className="klein"> (extern)</span>}
          {konflikt(p.email) && <span title={`Zeitgleich: ${konflikt(p.email)!.titel}`}> ⚠️</span>}
        </span>
      ))}
      {!personen.length && <span className="klein">{leer}</span>}
    </>
  );

  if (!mitAblauf) {
    const max = maxPersonen(termin.kategorie);
    const konflikt = konfliktIn([termin]);
    const aktuell = termin.personal ?? [];
    return (
      <section className="modal-block">
        <h3>
          Personal <span className="klein">{max === 1 ? '(1 Person)' : `(bis ${max} Personen)`}</span>
        </h3>
        {modus === 'termin' && einteilung ? (
          <Auswahl einteilung={einteilung} start={aktuell.map((p) => p.email)} max={max} konflikt={konflikt} onSpeichern={(w) => onEinteilen(termin, w)} onAbbrechen={() => setModus(null)} />
        ) : (
          <div className="personal-chips">
            {chips(aktuell, konflikt, 'Noch niemand eingeteilt.')}
            {darf && (
              <button className="knopf" onClick={() => setModus('termin')}>
                {aktuell.length ? 'Ändern' : 'Personal einteilen'}
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  const tag = tagWien(termin.start);
  const ablaufP = termin.ablaufPersonal ?? [];
  const eigen = termin.personalQuelle === 'termin' ? (termin.personal ?? []) : null;
  const konfliktAblauf = konfliktIn(ablauf);
  const konfliktTermin = konfliktIn([termin]);
  return (
    <section className="modal-block">
      <h3>
        Personal <span className="klein">(bis 5 Personen)</span>
      </h3>
      <div className="personal-ablauf">
        <div className="klein">
          <b>Ablauf {format(termin.start, 'EEE d.M.', { locale: de })}</b> · gilt für alle {ablauf.length} Termine:{' '}
          {ablauf.map((t) => `${format(t.start, 'HH:mm')} ${KATEGORIEN[t.kategorie].label}`).join(' → ')}
        </div>
        {modus === 'ablauf' && einteilung ? (
          <Auswahl
            einteilung={einteilung}
            start={ablaufP.map((p) => p.email)}
            max={5}
            konflikt={konfliktAblauf}
            hinweis="Abweichend eingeteilte Termine behalten ihr eigenes Personal."
            onSpeichern={(w) => onAblauf!(fall!, tag, w)}
            onAbbrechen={() => setModus(null)}
          />
        ) : (
          <div className="personal-chips">
            {chips(ablaufP, konfliktAblauf, 'Noch niemand eingeteilt.')}
            {darf && (
              <button className="knopf" onClick={() => setModus('ablauf')}>
                {ablaufP.length ? 'Ändern' : 'Personal einteilen'}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="personal-abweichend">
        <div className="klein">
          <b>Dieser Termin</b> · {eigen ? 'abweichend eingeteilt' : 'wie Ablauf'}
        </div>
        {modus === 'termin' && einteilung ? (
          <Auswahl
            einteilung={einteilung}
            start={(eigen ?? ablaufP).map((p) => p.email)}
            max={maxPersonen(termin.kategorie)}
            konflikt={konfliktTermin}
            hinweis="Nur für diesen Termin. Ohne Auswahl gilt wieder das Personal des Ablaufs."
            onSpeichern={(w) => onEinteilen(termin, w)}
            onAbbrechen={() => setModus(null)}
          />
        ) : (
          (eigen || darf) && (
            <div className="personal-chips">
              {eigen && chips(eigen, konfliktTermin, '')}
              {darf && (
                <button className="knopf" onClick={() => setModus('termin')}>
                  {eigen ? 'Ändern' : 'Abweichend einteilen'}
                </button>
              )}
              {darf && eigen && (
                <button className="knopf" onClick={() => void onEinteilen(termin, []).catch((e: Error) => alert(e.message))}>
                  Wie Ablauf
                </button>
              )}
            </div>
          )
        )}
      </div>
    </section>
  );
}

export default function TerminDetail({
  termin,
  alle,
  hinweise,
  einteilung = null,
  onEinteilen,
  onAblauf,
  onLoeschen,
  onWaehlen,
  onSchliessen,
}: {
  termin: Termin;
  alle: Termin[];
  hinweise: Warnung[];
  einteilung?: EinteilungRecht | null;
  onEinteilen?: (t: Termin, emails: string[]) => Promise<void>;
  onAblauf?: (fall: string, tag: string, emails: string[]) => Promise<void>;
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

          {onEinteilen && <PersonalBlock termin={termin} alle={alle} einteilung={einteilung} onEinteilen={onEinteilen} onAblauf={onAblauf} />}

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
