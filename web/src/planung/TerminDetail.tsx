import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { KATEGORIEN, ablaufGeeignet, ablaufTermine, checkliste, fallDaten, fallSchluessel, mapsLink, type Termin, type Warnung } from './planungLogic';
import { maxPersonen, personName, tagWien } from '../shared/einteilung';
import type { EinteilungRecht } from './api';
import { auswahlFuer, bedarf as bedarfVon, hatRolle, rolleVergeben, zeremonieFehler, zeremonieMax, type Bedarf } from '../shared/rollen';

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
  bedarf,
  konflikt,
  hinweis,
  onSpeichern,
  onAbbrechen,
}: {
  einteilung: EinteilungRecht;
  start: string[];
  max: number;
  bedarf: Bedarf;
  konflikt: (email: string) => Termin | undefined;
  hinweis?: string;
  onSpeichern: (emails: string[]) => Promise<void>;
  onAbbrechen: () => void;
}) {
  const [wahl, setWahl] = useState<string[]>(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const alle = einteilung.personen;
  const zeremonie = bedarf === 'zeremonie' && rolleVergeben(alle, 'arrangeur', 'arrangeurIA', 'traeger');
  if (zeremonie)
    return <ZeremonieAuswahl einteilung={einteilung} start={start} konflikt={konflikt} hinweis={hinweis} onSpeichern={onSpeichern} onAbbrechen={onAbbrechen} />;
  const liste = auswahlFuer(bedarf, alle);
  const ungefiltert = bedarf !== 'sonstig' && liste === alle;
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
      {ungefiltert && <p className="klein">Die nötige Rolle ({bedarf === 'gespraech' ? 'Berater' : 'Träger / Arrangeur'}) ist noch niemandem zugewiesen (Hub → Apps & Rechte) – alle stehen zur Wahl.</p>}
      <div className="personal-liste">
        {liste.map((p) => {
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

type PersonW = EinteilungRecht['personen'][number];

/** Trauerfeier, Rosenkranz, Beisetzung: zuerst ein Arrangeur (oder i.A., ein Träger nur nach Bestätigung), dann Träger. */
function ZeremonieAuswahl({
  einteilung,
  start,
  konflikt,
  hinweis,
  onSpeichern,
  onAbbrechen,
}: {
  einteilung: EinteilungRecht;
  start: string[];
  konflikt: (email: string) => Termin | undefined;
  hinweis?: string;
  onSpeichern: (emails: string[]) => Promise<void>;
  onAbbrechen: () => void;
}) {
  const alle = einteilung.personen;
  const nach = new Map(alle.map((p) => [p.email, p]));
  const istArr = (e?: string) => hatRolle(e ? nach.get(e) : undefined, 'arrangeur', 'arrangeurIA');
  const [arr, setArr] = useState<string | null>(start[0] ?? null);
  const [traegerOk, setTraegerOk] = useState(!!start[0] && !istArr(start[0]));
  const [rest, setRest] = useState<string[]>(start.slice(1));
  const [traegerZeigen, setTraegerZeigen] = useState(traegerOk);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const arrangeure = alle
    .filter((p) => hatRolle(p, 'arrangeur', 'arrangeurIA'))
    .sort((a, b) => Number(hatRolle(b, 'arrangeur')) - Number(hatRolle(a, 'arrangeur')) || personName(a).localeCompare(personName(b)));
  const traegerAlsArr = alle.filter((p) => hatRolle(p, 'traeger') && !hatRolle(p, 'arrangeur', 'arrangeurIA'));
  const weitere = alle.filter((p) => p.email !== arr && hatRolle(p, 'traeger', 'arrangeurIA'));
  const emails = arr ? [arr, ...rest.filter((e) => e !== arr)] : rest;
  const max = zeremonieMax(arr ? emails : ['', ...rest], alle);

  const arrWaehlen = (p: PersonW, alsTraeger: boolean) => {
    if (arr === p.email) {
      setArr(null);
      setTraegerOk(false);
      return;
    }
    if (alsTraeger && !confirm(`${personName(p)} ist kein Arrangeur, sondern Träger.\n\nTrotzdem als Arrangeur eintragen?`)) return;
    setArr(p.email);
    setTraegerOk(alsTraeger);
    setRest((r) => r.filter((e) => e !== p.email));
  };
  const restUmschalten = (email: string) =>
    setRest((r) => (r.includes(email) ? r.filter((e) => e !== email) : emails.length < max ? [...r, email] : r));

  async function speichern() {
    const f = emails.length && !arr ? 'Es braucht einen Arrangeur (oder Arrangeur i.A.)' : zeremonieFehler(emails, alle, traegerOk);
    if (f) return setFehler(f);
    setLaeuft(true);
    setFehler(null);
    try {
      await onSpeichern(emails);
      onAbbrechen();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  }
  const knopf = (p: PersonW, an: boolean, onClick: () => void, zusatz?: string, gesperrt = false) => {
    const k = konflikt(p.email);
    return (
      <button key={p.email} className={`personal-wahl ${an ? 'an' : ''}`} disabled={gesperrt} onClick={onClick}>
        <span>{an ? '✓' : '○'}</span>
        <span>
          {personName(p)}
          {zusatz && <span className="klein"> · {zusatz}</span>}
          {p.extern && <span className="klein"> · extern</span>}
        </span>
        {k && <span className="klein warnung-text">⚠️ zeitgleich: {k.verstorbener ?? k.titel}</span>}
      </button>
    );
  };
  return (
    <>
      <div className="klein personal-titel">🎩 Arrangeur</div>
      <div className="personal-liste">
        {arrangeure.map((p) => knopf(p, arr === p.email, () => arrWaehlen(p, false), hatRolle(p, 'arrangeur') ? undefined : 'i.A.'))}
        {!arrangeure.length && <span className="klein">Niemand hat die Rolle Arrangeur.</span>}
        {traegerZeigen
          ? traegerAlsArr.map((p) => knopf(p, arr === p.email, () => arrWaehlen(p, true), 'Träger ⚠️'))
          : traegerAlsArr.length > 0 && (
              <button className="knopf klein" onClick={() => setTraegerZeigen(true)}>
                Träger als Arrangeur …
              </button>
            )}
      </div>
      <div className="klein personal-titel">👥 Träger {arr ? `(${rest.length}/${max - 1})` : ''}</div>
      <div className="personal-liste">
        {weitere.map((p) => {
          const an = rest.includes(p.email);
          return knopf(p, an, () => restUmschalten(p.email), hatRolle(p, 'traeger') ? undefined : 'Arrangeur i.A. (zusätzlich)', !an && emails.length >= max);
        })}
      </div>
      <p className="klein">Ein Arrangeur i.A. kann zusätzlich als 6. Person mit.</p>
      {hinweis && <p className="klein">{hinweis}</p>}
      {fehler && <div className="warnung">{fehler}</div>}
      <div className="aktionen">
        <button className="knopf primaer" disabled={laeuft} onClick={() => void speichern()}>
          {laeuft ? 'Speichert …' : `Speichern (${emails.length}/${max})`}
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
  const rollenAktiv = !!einteilung && rolleVergeben(einteilung.personen, 'arrangeur', 'arrangeurIA', 'traeger');
  const chips = (personen: Person[], konflikt: (email: string) => Termin | undefined, leer: string, zeremonie = false) => (
    <>
      {personen.map((p, i) => (
        <span key={p.email} className="personal-chip">
          {zeremonie && rollenAktiv && i === 0 ? '🎩' : '👤'} {personName(p)}
          {zeremonie && rollenAktiv && i === 0 && <span className="klein"> (Arrangeur)</span>}
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
          <Auswahl einteilung={einteilung} start={aktuell.map((p) => p.email)} max={max} bedarf={bedarfVon(termin.kategorie)} konflikt={konflikt} onSpeichern={(w) => onEinteilen(termin, w)} onAbbrechen={() => setModus(null)} />
        ) : (
          <div className="personal-chips">
            {chips(aktuell, konflikt, 'Noch niemand eingeteilt.', bedarfVon(termin.kategorie) === 'zeremonie')}
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
  const ablaufBedarf: Bedarf = ablauf.some((t) => bedarfVon(t.kategorie) === 'zeremonie') ? 'zeremonie' : 'fahrt';
  const konfliktTermin = konfliktIn([termin]);
  return (
    <section className="modal-block">
      <h3>
        Personal <span className="klein">{ablaufBedarf === 'zeremonie' && rollenAktiv ? '(Arrangeur + bis 4 Träger)' : '(bis 5 Personen)'}</span>
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
            bedarf={ablaufBedarf}
            konflikt={konfliktAblauf}
            hinweis="Abweichend eingeteilte Termine behalten ihr eigenes Personal."
            onSpeichern={(w) => onAblauf!(fall!, tag, w)}
            onAbbrechen={() => setModus(null)}
          />
        ) : (
          <div className="personal-chips">
            {chips(ablaufP, konfliktAblauf, 'Noch niemand eingeteilt.', ablaufBedarf === 'zeremonie')}
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
            bedarf={bedarfVon(termin.kategorie)}
            konflikt={konfliktTermin}
            hinweis="Nur für diesen Termin. Ohne Auswahl gilt wieder das Personal des Ablaufs."
            onSpeichern={(w) => onEinteilen(termin, w)}
            onAbbrechen={() => setModus(null)}
          />
        ) : (
          (eigen || darf) && (
            <div className="personal-chips">
              {eigen && chips(eigen, konfliktTermin, '', bedarfVon(termin.kategorie) === 'zeremonie')}
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
  onBearbeiten,
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
  onBearbeiten?: (t: Termin) => void;
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
          {(onLoeschen || onBearbeiten) && (
            <div className="aktionen">
              {onBearbeiten && (
                <button className="knopf primaer" onClick={() => onBearbeiten(termin)}>
                  ✎ Bearbeiten
                </button>
              )}
              {onLoeschen && <button className="knopf rot" onClick={() => void onLoeschen(termin).catch((e: Error) => alert(e.message))}>
                Termin löschen
              </button>}
            </div>
          )}
          <p className="klein modal-fuss">Kalender: {termin.kalenderName}</p>
        </div>
      </div>
    </div>
  );
}
