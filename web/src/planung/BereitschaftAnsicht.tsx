import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { bereitschaftAustragen, bereitschaftEintragen, bereitschaftLaden, type BereitschaftDaten } from './api';
import { MAX_GLEICHZEITIG, ausText, datumText, dienste, einsaetzeIn, plusTage, zeitText, type Dienst, type Einsatz } from '../shared/bereitschaft';

const WOCHEN = 12;

/** Lädt die Bereitschaftsliste (nur mit Freigabe). */
export function useBereitschaft(aktiv: boolean) {
  const [daten, setDaten] = useState<BereitschaftDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const laden = useCallback(() => {
    if (!aktiv) return;
    bereitschaftLaden()
      .then((d) => {
        setDaten(d);
        setFehler(null);
      })
      .catch((e: Error) => setFehler(e.message));
  }, [aktiv]);
  useEffect(() => {
    laden();
    if (!aktiv) return;
    const t = setInterval(laden, 120_000);
    return () => clearInterval(t);
  }, [aktiv, laden]);
  return { daten, setDaten, fehler, setFehler, laden };
}

/** Wer an einem Tag Bereitschaft hat (für Tagesplan). */
export function bereitschaftAm(eintraege: Einsatz[], tag: Date): Einsatz[] {
  return einsaetzeIn(eintraege, { von: `${datumText(tag)}T00:00`, bis: `${datumText(plusTage(tag, 1))}T00:00` });
}

const anzeigeName = (e: { email: string; name?: string }) => e.name || e.email.split('@')[0];

function zeitraum(von: string, bis: string): string {
  const a = ausText(von);
  const b = ausText(bis);
  const bisText = bis.endsWith('T00:00') ? `${format(plusTage(b, -1), 'EEE d.M.', { locale: de })} 24:00` : format(b, 'EEE d.M. HH:mm', { locale: de });
  return `${format(a, 'EEE d.M. HH:mm', { locale: de })} – ${bisText}`;
}

export function BereitschaftZeile({ eintraege }: { eintraege: Einsatz[] }) {
  if (!eintraege.length) return null;
  return (
    <div className="bereitschaft-hinweis">
      <span>🛡 Bereitschaft:</span>
      {eintraege.map((e) => (
        <span key={e.id} className="pille an">
          {anzeigeName(e)}
          {!(e.von.endsWith('T00:00') && e.bis.endsWith('T00:00')) && <small> {e.von.slice(11)}–{e.bis.slice(11)}</small>}
        </span>
      ))}
    </div>
  );
}

function DienstKarte({ d, daten, onDaten }: { d: Dienst; daten: BereitschaftDaten; onDaten: (d: BereitschaftDaten) => void }) {
  const liste = einsaetzeIn(daten.eintraege, d);
  const [offen, setOffen] = useState(false);
  const [email, setEmail] = useState(daten.ich.email);
  const [ganz, setGanz] = useState(true);
  const [von, setVon] = useState(d.von);
  const [bis, setBis] = useState(d.bis);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const jetzt = zeitText(new Date());
  const aktuell = d.von <= jetzt && jetzt < d.bis;
  const vorbei = d.bis <= jetzt;
  const ichDabei = liste.some((e) => e.email === daten.ich.email);
  const personen = useMemo(() => {
    const m = new Map(daten.personen.map((p) => [p.email, p]));
    m.set(daten.ich.email, daten.ich);
    return [...m.values()].sort((a, b) => anzeigeName(a).localeCompare(anzeigeName(b)));
  }, [daten]);

  const tun = async (f: () => Promise<BereitschaftDaten>) => {
    setLaeuft(true);
    setFehler(null);
    try {
      onDaten(await f());
      setOffen(false);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };
  const ende = ausText(d.bis);
  const titel =
    d.art === 'wochenende'
      ? `Wochenende ${format(ausText(d.von), 'd.M.')} – ${format(plusTage(ende, -1), 'd.M.yyyy')}`
      : `${format(ausText(d.von), 'EEEE d.M.yyyy', { locale: de })}`;

  return (
    <article className={`glas dienst ${aktuell ? 'aktuell' : ''} ${vorbei ? 'vorbei' : ''}`}>
      <header className="dienst-kopf">
        <div>
          <strong>{titel}</strong>
          {d.feiertage.length > 0 && <div className="dienst-feiertag">🎌 {d.feiertage.join(', ')}</div>}
        </div>
        <span className={`dienst-status ${liste.length ? 'besetzt' : 'offen'}`}>{aktuell ? 'jetzt · ' : ''}{liste.length ? `${liste.length} eingeteilt` : 'offen'}</span>
      </header>
      {liste.length > 0 && (
        <ul className="dienst-liste">
          {liste.map((e) => (
            <li key={e.id}>
              <span className="dienst-name">{anzeigeName(e)}</span>
              <span className="klein">{e.von === d.von && e.bis === d.bis ? (d.art === 'wochenende' ? 'ganzes Wochenende' : 'ganzer Tag') : zeitraum(e.von, e.bis)}</span>
              {(daten.darfPlanen || e.email === daten.ich.email) && !vorbei && (
                <button className="knopf klein-knopf" disabled={laeuft} onClick={() => void tun(() => bereitschaftAustragen(e.id))}>
                  Austragen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!vorbei && !offen && (daten.darfPlanen || !ichDabei) && (
        <div className="dienst-aktionen">
          {!ichDabei && (
            <button className="knopf primaer" disabled={laeuft} onClick={() => void tun(() => bereitschaftEintragen({ von: d.von, bis: d.bis }))}>
              Mich eintragen
            </button>
          )}
          <button className="knopf" onClick={() => { setOffen(true); setEmail(ichDabei ? '' : daten.ich.email); }}>
            {daten.darfPlanen ? '+ Einteilen …' : 'Nur bestimmte Zeit …'}
          </button>
        </div>
      )}
      {offen && (
        <form
          className="dienst-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            void tun(() => bereitschaftEintragen({ email: email || daten.ich.email, von: ganz ? d.von : von, bis: ganz ? d.bis : bis }));
          }}
        >
          {daten.darfPlanen && (
            <select className="feld" value={email} required onChange={(ev) => setEmail(ev.target.value)}>
              <option value="" disabled>Mitarbeiter wählen</option>
              {personen.map((p) => (
                <option key={p.email} value={p.email}>
                  {anzeigeName(p)}{p.email === daten.ich.email ? ' (ich)' : ''}
                </option>
              ))}
            </select>
          )}
          <label className="pille-wahl">
            <input type="checkbox" checked={ganz} onChange={() => setGanz(!ganz)} /> {d.art === 'wochenende' ? 'Ganzes Wochenende' : 'Ganzer Tag'}
          </label>
          {!ganz && (
            <div className="dienst-zeiten">
              <label>
                von <input className="feld" type="datetime-local" required min={d.von} max={d.bis} value={von} onChange={(ev) => setVon(ev.target.value)} />
              </label>
              <label>
                bis <input className="feld" type="datetime-local" required min={d.von} max={d.bis} value={bis} onChange={(ev) => setBis(ev.target.value)} />
              </label>
            </div>
          )}
          <div className="dienst-aktionen">
            <button className="knopf primaer" disabled={laeuft} type="submit">Eintragen</button>
            <button className="knopf" type="button" onClick={() => setOffen(false)}>Abbrechen</button>
          </div>
        </form>
      )}
      {fehler && <p className="dienst-fehler">{fehler}</p>}
    </article>
  );
}

export default function BereitschaftAnsicht({ aktiv }: { aktiv: boolean }) {
  const { daten, setDaten, fehler } = useBereitschaft(aktiv);
  const [wochen, setWochen] = useState(WOCHEN);
  const [nurMeine, setNurMeine] = useState(false);
  const liste = useMemo(() => {
    const heute = new Date();
    return dienste(heute, plusTage(heute, wochen * 7));
  }, [wochen]);

  if (!aktiv) return <p className="leer">Für die Bereitschaft bitte anmelden – oder du hast noch keine Freigabe.</p>;
  if (!daten) return <p className="leer">{fehler ?? 'Lädt …'}</p>;
  const gezeigt = nurMeine ? liste.filter((d) => einsaetzeIn(daten.eintraege, d).some((e) => e.email === daten.ich.email)) : liste;

  return (
    <section className="ansicht liste bereitschaft">
      <div className="bereitschaft-kopf">
        <h2>Bereitschaft</h2>
        <label className="pille-wahl">
          <input type="checkbox" checked={nurMeine} onChange={() => setNurMeine(!nurMeine)} /> Nur meine
        </label>
      </div>
      <p className="klein">
        Wochenenden (Fr–So) und Feiertage · höchstens {MAX_GLEICHZEITIG} Personen gleichzeitig ·{' '}
        {daten.darfPlanen ? 'du darfst alle einteilen' : 'trag dich selbst ein oder aus'}
      </p>
      {fehler && <div className="banner fehler">{fehler}</div>}
      {gezeigt.map((d) => (
        <DienstKarte key={d.id} d={d} daten={daten} onDaten={setDaten} />
      ))}
      {gezeigt.length === 0 && <p className="leer">Keine Einträge</p>}
      <button className="knopf" onClick={() => setWochen(wochen + WOCHEN)}>Weitere Wochen anzeigen</button>
    </section>
  );
}
