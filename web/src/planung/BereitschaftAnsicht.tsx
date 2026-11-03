import { useCallback, useEffect, useMemo, useState } from 'react';
import { standText } from './offlineCache';
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar';
import { endOfMonth, format, getDay, parse, startOfMonth, startOfWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { bereitschaftAustragen, bereitschaftEintragen, bereitschaftLaden, type BereitschaftDaten } from './api';
import {
  MAX_GLEICHZEITIG,
  ausText,
  datumText,
  dienste,
  einsaetzeIn,
  jahresUebersicht,
  plusTage,
  zeitText,
  type Dienst,
  type Einsatz,
  type PersonStatistik,
} from '../shared/bereitschaft';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }), getDay, locales: { de } });

const WOCHEN = 12;
/** Ziel nach der Google-Anmeldung (die immer auf „/“ zurückkehrt). */
export const NACH_ANMELDUNG = 'alamida.nachAnmeldung';

/** Lädt die Bereitschaftsliste (nur mit Freigabe). */
export function useBereitschaft(aktiv: boolean, ab?: string) {
  const [daten, setDaten] = useState<BereitschaftDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const laden = useCallback(() => {
    if (!aktiv) return;
    bereitschaftLaden(ab)
      .then((d) => {
        setDaten(d);
        setFehler(d.offlineStand ? standText(d.offlineStand) : null);
      })
      .catch((e: Error) => setFehler(e.message));
  }, [aktiv, ab]);
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

interface KartenProps {
  d: Dienst;
  daten: BereitschaftDaten;
  onDaten: (d: BereitschaftDaten) => void;
  ab?: string;
}

function DienstKarte({ d, daten, onDaten, ab }: KartenProps) {
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
                <button className="knopf klein-knopf" disabled={laeuft} onClick={() => void tun(() => bereitschaftAustragen(e.id, ab))}>
                  Austragen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!vorbei && !offen && (
        <div className="dienst-aktionen">
          {!ichDabei && (
            <button className="knopf primaer" disabled={laeuft} onClick={() => void tun(() => bereitschaftEintragen({ von: d.von, bis: d.bis }, ab))}>
              Mich eintragen
            </button>
          )}
          <button className="knopf" onClick={() => { setOffen(true); setGanz(!ichDabei); setEmail(ichDabei && daten.darfPlanen ? '' : daten.ich.email); }}>
            {daten.darfPlanen ? '+ Einteilen …' : ichDabei ? '+ Weitere Zeit …' : 'Nur bestimmte Zeit …'}
          </button>
        </div>
      )}
      {offen && (
        <form
          className="dienst-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            void tun(() => bereitschaftEintragen({ email: email || daten.ich.email, von: ganz ? d.von : von, bis: ganz ? d.bis : bis }, ab));
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

type Modus = 'planung' | 'liste' | 'uebersicht';
const LS_MODUS = 'alamida.bereitschaftModus';
const FARBEN = ['#d4b06a', '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#f97316', '#22d3ee', '#facc15'];
const farbeFuer = (email: string) => FARBEN[[...email].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % FARBEN.length];
const ganzerTag = (e: { von: string; bis: string }) => e.von.endsWith('T00:00') && e.bis.endsWith('T00:00');
const kuerzel = (e: { email: string; name?: string }) =>
  anzeigeName(e)
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
function useSchmal(px = 760) {
  const [schmal, setSchmal] = useState(() => window.matchMedia(`(max-width: ${px}px)`).matches);
  useEffect(() => {
    const m = window.matchMedia(`(max-width: ${px}px)`);
    const f = () => setSchmal(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [px]);
  return schmal;
}
const minText = (a: string, b: string) => (a < b ? a : b);

interface KalEintrag {
  id: string;
  titel: string;
  start: Date;
  ende: Date;
  ganz: boolean;
  dienst: Dienst;
  farbe: string;
  offen?: boolean;
}

function DienstModal({ d, onSchliessen, ...props }: Omit<KartenProps, 'd'> & { d: Dienst; onSchliessen: () => void }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === 'Escape' && onSchliessen();
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, [onSchliessen]);
  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <div className="modal bs-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="bs-schliessen" onClick={onSchliessen} aria-label="Schließen">✕</button>
        <DienstKarte d={d} {...props} />
      </div>
    </div>
  );
}

function PlanungKalender({ daten, datum, setDatum, onWahl }: { daten: BereitschaftDaten; datum: Date; setDatum: (d: Date) => void; onWahl: (d: Dienst) => void }) {
  const [ansicht, setAnsicht] = useState<View>(Views.MONTH);
  const schmal = useSchmal();
  const kurz = schmal && ansicht === Views.MONTH;
  const { liste, eintraege, tage } = useMemo(() => {
    const liste = dienste(plusTage(startOfMonth(datum), -14), plusTage(endOfMonth(datum), 14));
    const eintraege: KalEintrag[] = [];
    const jetzt = zeitText(new Date());
    const tage = new Map<string, Dienst>();
    for (const d of liste) {
      for (let t = ausText(d.von); t < ausText(d.bis); t = plusTage(t, 1)) tage.set(datumText(t), d);
      const belegt = einsaetzeIn(daten.eintraege, d);
      if (!belegt.length && d.bis > jetzt) eintraege.push({ id: `offen-${d.id}`, titel: kurz ? '+' : '+ offen', start: ausText(d.von), ende: ausText(d.bis), ganz: true, dienst: d, farbe: 'var(--warn)', offen: true });
      for (const e of belegt)
        eintraege.push({
          id: `${d.id}-${e.id}`,
          titel: kurz
            ? `${e.email === daten.ich.email ? '★' : ''}${kuerzel(e)}${ganzerTag(e) ? '' : '◔'}`
            : `${e.email === daten.ich.email ? '★ ' : ''}${anzeigeName(e)}${ganzerTag(e) ? '' : ` ${e.von.slice(11)}–${e.bis.slice(11)}`}`,
          start: ausText(e.von < d.von ? d.von : e.von),
          ende: ausText(e.bis > d.bis ? d.bis : e.bis),
          ganz: ganzerTag(e),
          dienst: d,
          farbe: farbeFuer(e.email),
        });
    }
    return { liste, eintraege, tage };
  }, [daten, datum, kurz]);
  const feiertagsTage = useMemo(() => new Set(liste.flatMap((d) => (d.art === 'feiertag' ? [d.von.slice(0, 10)] : []))), [liste]);

  return (
    <section className="ansicht kalender-ansicht glas bs-kalender">
      <Calendar
        localizer={localizer}
        culture="de"
        events={eintraege}
        titleAccessor={(t: KalEintrag) => t.titel}
        tooltipAccessor={(t: KalEintrag) => (t.offen ? 'Noch niemand eingeteilt – klicken zum Einteilen' : t.titel)}
        className={kurz ? 'bs-kurz' : ''}
        startAccessor="start"
        endAccessor="ende"
        allDayAccessor="ganz"
        view={ansicht}
        onView={setAnsicht}
        date={datum}
        onNavigate={setDatum}
        views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
        selectable
        popup
        onSelectEvent={(t: KalEintrag) => onWahl(t.dienst)}
        onSelectSlot={({ start }: { start: Date }) => {
          const d = tage.get(datumText(start));
          if (d) onWahl(d);
        }}
        dayPropGetter={(tag: Date) => {
          const t = datumText(tag);
          return { className: feiertagsTage.has(t) ? 'bs-feiertag' : tage.has(t) ? 'bs-dienst-tag' : '' };
        }}
        eventPropGetter={(t: KalEintrag) => ({ className: t.offen ? 'bs-offen' : '', style: { ['--kat' as string]: t.farbe } as React.CSSProperties })}
        formats={{
          dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
            `${format(start, 'd. MMM', { locale: de })} – ${format(end, 'd. MMM yyyy', { locale: de })}`,
          monthHeaderFormat: (d: Date) => format(d, 'MMMM yyyy', { locale: de }),
          dayFormat: (d: Date) => format(d, 'EEE d.', { locale: de }),
          timeGutterFormat: (d: Date) => format(d, 'HH:mm'),
        }}
        messages={{
          today: 'Heute',
          previous: '‹',
          next: '›',
          month: 'Monat',
          week: 'Woche',
          agenda: 'Liste',
          date: 'Datum',
          time: 'Zeit',
          event: 'Bereitschaft',
          allDay: 'ganz',
          noEventsInRange: 'Keine Dienste',
          showMore: (n: number) => `+${n} weitere`,
        }}
        style={{ height: schmal ? 'calc(100dvh - 210px)' : 'calc(100dvh - 240px)', minHeight: schmal ? 380 : 480 }}
      />
      <div className="bs-legende klein">
        <span><i className="bs-punkt bs-p-dienst" /> Wochenende / Feiertag</span>
        <span><i className="bs-punkt bs-p-feiertag" /> Feiertag</span>
        <span><i className="bs-punkt bs-p-offen" /> noch offen</span>
        {kurz && <span>Kürzel = Initialen · ◔ = Teilzeit</span>}
        <span>★ ich · Klick auf einen Tag oder Eintrag zum {daten.darfPlanen ? 'Einteilen' : 'Eintragen'}</span>
      </div>
    </section>
  );
}

function Uebersicht({ daten, jahr, setJahr, onWahl }: { daten: BereitschaftDaten; jahr: number; setJahr: (j: number) => void; onWahl: (d: Dienst) => void }) {
  const jetzt = zeitText(new Date());
  const heute = new Date();
  const kommend = useMemo(() => dienste(heute, plusTage(heute, 56)).filter((d) => d.bis > jetzt), [jetzt.slice(0, 10)]); // eslint-disable-line react-hooks/exhaustive-deps
  const offen = kommend.filter((d) => !einsaetzeIn(daten.eintraege, d).length);
  const jahresDienste = useMemo(() => dienste(new Date(jahr, 0, 1), new Date(jahr, 11, 31)).filter((d) => d.von.startsWith(String(jahr))), [jahr]);
  const besetzt = jahresDienste.filter((d) => einsaetzeIn(daten.eintraege, d).length).length;
  const personen = useMemo(() => {
    const stat = jahresUebersicht(daten.eintraege, jahr, jetzt);
    const bekannt = new Set(stat.map((p) => p.email));
    const ohne = [...daten.personen, daten.ich]
      .filter((p) => !bekannt.has(p.email) && (bekannt.add(p.email), true))
      .map((p): PersonStatistik => ({ email: p.email, name: p.name, einsaetze: 0, ganzeWochenenden: 0, tage: 0, feiertage: 0 }));
    return [...stat, ...ohne];
  }, [daten, jahr, jetzt]);
  const max = Math.max(1, ...personen.map((p) => p.tage));
  const meinNaechster = daten.eintraege.filter((e) => e.email === daten.ich.email && e.bis > jetzt).sort((a, b) => a.von.localeCompare(b.von))[0];

  return (
    <section className="ansicht bs-uebersicht">
      <div className="bs-kacheln">
        <div className="kachel glas">
          <div className="kachel-label">Offen · nächste 8 Wochen</div>
          <div className={`kachel-wert ${offen.length ? 'bs-warn' : 'bs-ok'}`}>{offen.length}</div>
          <div className="kachel-sub">von {kommend.length} Diensten</div>
        </div>
        <div className="kachel glas">
          <div className="kachel-label">Besetzt {jahr}</div>
          <div className="kachel-wert">{besetzt}<small> / {jahresDienste.length}</small></div>
          <div className="kachel-sub">Wochenenden & Feiertage</div>
        </div>
        <div className="kachel glas">
          <div className="kachel-label">Mein nächster Dienst</div>
          <div className="kachel-wert bs-klein">{meinNaechster ? format(ausText(meinNaechster.von), 'EEE d. MMM', { locale: de }) : '–'}</div>
          <div className="kachel-sub">{meinNaechster ? zeitraum(meinNaechster.von, meinNaechster.bis) : 'nicht eingetragen'}</div>
        </div>
      </div>

      <div className="bs-spalten">
        <div className="glas bs-block">
          <div className="bs-block-kopf">
            <h3>Verteilung {jahr}</h3>
            <div className="tag-nav-knoepfe">
              <button onClick={() => setJahr(jahr - 1)} aria-label="Vorheriges Jahr">‹</button>
              <button className={jahr === heute.getFullYear() ? 'aktiv' : ''} onClick={() => setJahr(heute.getFullYear())}>{jahr}</button>
              <button onClick={() => setJahr(jahr + 1)} aria-label="Nächstes Jahr">›</button>
            </div>
          </div>
          <table className="bs-tabelle">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th title="Ganze Wochenenden Fr–So">Ganze WE</th>
                <th>Bereitschaftstage</th>
                <th>Feiertage</th>
                <th>Nächster</th>
              </tr>
            </thead>
            <tbody>
              {personen.map((p) => (
                <tr key={p.email} className={p.email === daten.ich.email ? 'ich' : ''}>
                  <td>
                    <span className="bs-punkt" style={{ background: farbeFuer(p.email) }} /> {anzeigeName(p)}
                  </td>
                  <td>{p.ganzeWochenenden}</td>
                  <td className="bs-balken-zelle">
                    <span className="bs-balken" style={{ width: `${(p.tage / max) * 100}%`, background: farbeFuer(p.email) }} />
                    <span>{p.tage}</span>
                  </td>
                  <td>{p.feiertage}</td>
                  <td className="klein">{p.naechster ? format(ausText(p.naechster.von), 'd.M.yyyy') : '–'}</td>
                </tr>
              ))}
              {personen.length === 0 && (
                <tr>
                  <td colSpan={5} className="leer">Noch keine Einträge</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="glas bs-block">
          <h3>Noch offen</h3>
          {offen.length === 0 && <p className="leer gross">Alles besetzt ✓</p>}
          <ul className="bs-offen-liste">
            {offen.map((d) => (
              <li key={d.id}>
                <button className="warnung" onClick={() => onWahl(d)}>
                  <strong>{d.art === 'wochenende' ? `Wochenende ${format(ausText(d.von), 'd.M.')}` : format(ausText(d.von), 'EEEE d.M.', { locale: de })}</strong>
                  <span className="klein">{d.feiertage.length ? `🎌 ${d.feiertage.join(', ')}` : 'Fr – So'} · {daten.darfPlanen ? 'einteilen' : 'eintragen'} →</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default function BereitschaftAnsicht({ aktiv }: { aktiv: boolean }) {
  const [modus, setModusRoh] = useState<Modus>(() => (localStorage.getItem(LS_MODUS) as Modus | null) ?? (window.innerWidth < 760 ? 'liste' : 'planung'));
  const setModus = (m: Modus) => {
    setModusRoh(m);
    localStorage.setItem(LS_MODUS, m);
  };
  const [datum, setDatum] = useState(() => new Date());
  const [jahr, setJahr] = useState(() => new Date().getFullYear());
  const ab = minText(datumText(plusTage(startOfMonth(datum), -14)), `${jahr}-01-01`);
  const { daten, setDaten, fehler } = useBereitschaft(aktiv, ab);
  const [gewaehlt, setGewaehlt] = useState<Dienst | null>(null);
  const [wochen, setWochen] = useState(WOCHEN);
  const [nurMeine, setNurMeine] = useState(false);
  const liste = useMemo(() => {
    const heute = new Date();
    return dienste(heute, plusTage(heute, wochen * 7));
  }, [wochen]);
  const schliessen = useCallback(() => setGewaehlt(null), []);

  if (!aktiv) return <p className="leer">Für die Bereitschaft bitte anmelden – oder du hast noch keine Freigabe.</p>;
  if (!daten) return <p className="leer">{fehler ?? 'Lädt …'}</p>;
  const gezeigt = nurMeine ? liste.filter((d) => einsaetzeIn(daten.eintraege, d).some((e) => e.email === daten.ich.email)) : liste;

  return (
    <div className={`bereitschaft bs-modus-${modus}`}>
      <div className="bereitschaft-kopf">
        <div>
          <h2>Bereitschaft</h2>
          <p className="klein">
            Wochenenden (Fr–So) und Feiertage · höchstens {MAX_GLEICHZEITIG} Personen gleichzeitig ·{' '}
            {daten.darfPlanen ? 'du darfst alle einteilen' : 'trag dich selbst ein oder aus'}
          </p>
        </div>
        <div className="tag-nav-knoepfe bs-umschalter" role="tablist">
          {([
            ['planung', '▦ Planung'],
            ['liste', '☰ Liste'],
            ['uebersicht', '◔ Übersicht'],
          ] as [Modus, string][]).map(([m, label]) => (
            <button key={m} role="tab" aria-selected={modus === m} className={modus === m ? 'aktiv' : ''} onClick={() => setModus(m)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {fehler && <div className="banner fehler">{fehler}</div>}

      {modus === 'planung' && <PlanungKalender daten={daten} datum={datum} setDatum={setDatum} onWahl={setGewaehlt} />}
      {modus === 'uebersicht' && <Uebersicht daten={daten} jahr={jahr} setJahr={setJahr} onWahl={setGewaehlt} />}
      {modus === 'liste' && (
        <section className="ansicht liste bs-liste">
          <label className="pille-wahl">
            <input type="checkbox" checked={nurMeine} onChange={() => setNurMeine(!nurMeine)} /> Nur meine
          </label>
          {gezeigt.map((d) => (
            <DienstKarte key={d.id} d={d} daten={daten} onDaten={setDaten} ab={ab} />
          ))}
          {gezeigt.length === 0 && <p className="leer">Keine Einträge</p>}
          <button className="knopf" onClick={() => setWochen(wochen + WOCHEN)}>Weitere Wochen anzeigen</button>
        </section>
      )}
      {gewaehlt && <DienstModal d={gewaehlt} daten={daten} onDaten={setDaten} ab={ab} onSchliessen={schliessen} />}
    </div>
  );
}
