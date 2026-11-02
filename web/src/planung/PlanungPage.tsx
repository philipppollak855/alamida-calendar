import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { de } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './planung.css';
import { anmelden, kalenderListe, termineLaden, type KalenderInfo } from './googleCalendar';
import { demoTermine } from './demoDaten';
import {
  GRUPPEN,
  KATEGORIEN,
  ausGoogleEvent,
  fahrten,
  nachGruppe,
  plusTage,
  startDesTages,
  sterbefaelle,
  termineAmTag,
  warnungen,
  type Kategorie,
  type Termin,
} from './planungLogic';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }), getDay, locales: { de } });

type Tab = 'tag' | 'kalender' | 'faelle' | 'fahrten' | 'hinweise';
const LS_CLIENT = 'alamida.clientId';
const LS_KALENDER = 'alamida.kalender';
const ENV_CLIENT = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';

const uhrzeit = (d: Date) => format(d, 'HH:mm');
const tagLabel = (d: Date) => format(d, 'EEEE, d. MMMM yyyy', { locale: de });

function TerminKarte({ t, mitDatum = false }: { t: Termin; mitDatum?: boolean }) {
  const k = KATEGORIEN[t.kategorie];
  return (
    <a className="termin" style={{ borderLeftColor: k.farbe }} href={t.link} target="_blank" rel="noreferrer">
      <div className="termin-zeit">
        {mitDatum && <span>{format(t.start, 'EEE d.M.', { locale: de })} </span>}
        {t.ganztaegig ? 'ganztägig' : `${uhrzeit(t.start)}–${uhrzeit(t.ende)}`}
      </div>
      <div className="termin-titel">
        <span className="termin-symbol">{k.symbol}</span> {k.label}
        {t.verstorbener && <strong> {t.verstorbener}</strong>}
      </div>
      {t.ort && <div className="termin-ort">📍 {t.ort}</div>}
      {!t.verstorbener && <div className="termin-ort">{t.titel}</div>}
    </a>
  );
}

export default function PlanungPage() {
  const [clientId, setClientId] = useState(() => localStorage.getItem(LS_CLIENT) ?? ENV_CLIENT);
  const [token, setToken] = useState<string | null>(null);
  const [kalender, setKalender] = useState<KalenderInfo[]>([]);
  const [auswahl, setAuswahl] = useState<string[]>(() => JSON.parse(localStorage.getItem(LS_KALENDER) ?? '[]'));
  const [termine, setTermine] = useState<Termin[]>(() => demoTermine());
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [stand, setStand] = useState<Date | null>(null);
  const [tab, setTab] = useState<Tab>('tag');
  const [tag, setTag] = useState(() => startDesTages(new Date()));
  const [kalView, setKalView] = useState<View>(Views.WEEK);
  const [kalDatum, setKalDatum] = useState(new Date());
  const [aus, setAus] = useState<Kategorie[]>([]);
  const [einstellungen, setEinstellungen] = useState(false);
  const demo = token === null;

  const laden = useCallback(async () => {
    if (!token) return;
    setLaedt(true);
    try {
      const ids = auswahl.length ? auswahl : kalender.map((k) => k.id);
      const von = plusTage(startDesTages(new Date()), -60);
      const bis = plusTage(von, 240);
      const listen = await Promise.all(
        ids.map(async (id) => {
          const name = kalender.find((k) => k.id === id)?.name ?? id;
          return (await termineLaden(token, id, von, bis)).map((e) => ausGoogleEvent(e, id, name));
        }),
      );
      setTermine(listen.flat().filter((t): t is Termin => t !== null));
      setStand(new Date());
      setFehler(null);
    } catch (e) {
      setFehler((e as Error).message);
      if ((e as Error).message === 'Anmeldung abgelaufen') setToken(null);
    } finally {
      setLaedt(false);
    }
  }, [token, auswahl, kalender]);

  useEffect(() => {
    void laden();
    if (!token) return;
    const timer = setInterval(() => void laden(), 60_000);
    return () => clearInterval(timer);
  }, [laden, token]);

  async function onAnmelden() {
    if (!clientId) {
      setEinstellungen(true);
      return;
    }
    try {
      const r = await anmelden(clientId);
      const liste = await kalenderListe(r.token);
      setKalender(liste);
      setToken(r.token);
      setTimeout(() => setToken(null), r.gueltigBis - Date.now() - 60_000);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  function toggleKalender(id: string) {
    const neu = auswahl.includes(id) ? auswahl.filter((x) => x !== id) : [...auswahl, id];
    setAuswahl(neu);
    localStorage.setItem(LS_KALENDER, JSON.stringify(neu));
  }

  const sichtbar = useMemo(() => termine.filter((t) => !aus.includes(t.kategorie)), [termine, aus]);
  const jetzt = new Date();
  const hinweise = useMemo(() => warnungen(sichtbar, new Date()), [sichtbar]);
  const tagGruppen = nachGruppe(termineAmTag(sichtbar, tag));
  const spalten = [...GRUPPEN, ...(tagGruppen.Sonstiges.length ? (['Sonstiges'] as const) : [])];

  return (
    <div className="planung">
      <header className="planung-kopf">
        <h1>Alamida Planung</h1>
        <nav className="planung-tabs">
          {(
            [
              ['tag', 'Tagesplan'],
              ['kalender', 'Woche / Monat'],
              ['faelle', 'Sterbefälle'],
              ['fahrten', 'Fahrten'],
              ['hinweise', `Hinweise${hinweise.length ? ` (${hinweise.length})` : ''}`],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} className={tab === id ? 'aktiv' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="planung-konto">
          {demo ? (
            <button className="primaer" onClick={onAnmelden}>Mit Google anmelden</button>
          ) : (
            <button onClick={() => void laden()} disabled={laedt}>{laedt ? 'Lädt…' : '↻ Aktualisieren'}</button>
          )}
          <button onClick={() => setEinstellungen((x) => !x)} title="Einstellungen">⚙</button>
        </div>
      </header>

      {demo && (
        <div className="hinweis-leiste">Beispieldaten – nach der Google-Anmeldung erscheinen eure echten Termine.</div>
      )}
      {fehler && <div className="hinweis-leiste fehler">{fehler}</div>}

      {einstellungen && (
        <section className="einstellungen">
          <label>
            Google OAuth-Client-ID
            <input
              value={clientId}
              placeholder="…apps.googleusercontent.com"
              onChange={(e) => {
                setClientId(e.target.value.trim());
                localStorage.setItem(LS_CLIENT, e.target.value.trim());
              }}
            />
          </label>
          {kalender.length > 0 && (
            <fieldset>
              <legend>Kalender (keine Auswahl = alle)</legend>
              {kalender.map((k) => (
                <label key={k.id} className="check">
                  <input type="checkbox" checked={auswahl.includes(k.id)} onChange={() => toggleKalender(k.id)} />
                  <span className="punkt" style={{ background: k.farbe }} /> {k.name}
                </label>
              ))}
            </fieldset>
          )}
        </section>
      )}

      <div className="filter-leiste">
        {(Object.keys(KATEGORIEN) as Kategorie[])
          .filter((k) => k !== 'Sonstiges')
          .map((k) => (
            <button
              key={k}
              className={`chip ${aus.includes(k) ? 'aus' : ''}`}
              style={{ borderColor: KATEGORIEN[k].farbe }}
              onClick={() => setAus(aus.includes(k) ? aus.filter((x) => x !== k) : [...aus, k])}
            >
              {KATEGORIEN[k].symbol} {KATEGORIEN[k].label}
            </button>
          ))}
        {stand && <span className="stand">Stand {uhrzeit(stand)}</span>}
      </div>

      {tab === 'tag' && (
        <section>
          <div className="tag-nav">
            <button onClick={() => setTag(plusTage(tag, -1))}>←</button>
            <button onClick={() => setTag(startDesTages(new Date()))}>Heute</button>
            <button onClick={() => setTag(plusTage(tag, 1))}>→</button>
            <h2>{tagLabel(tag)}</h2>
          </div>
          <div className="spalten">
            {spalten.map((g) => (
              <div key={g} className="spalte">
                <h3>
                  {g} <span className="anzahl">{tagGruppen[g].length}</span>
                </h3>
                {tagGruppen[g].length === 0 && <p className="leer">Keine Termine</p>}
                {tagGruppen[g].map((t) => (
                  <TerminKarte key={t.id} t={t} />
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'kalender' && (
        <section className="kalender-ansicht">
          <Calendar
            localizer={localizer}
            culture="de"
            events={sichtbar}
            titleAccessor={(t: Termin) => `${KATEGORIEN[t.kategorie].symbol} ${t.verstorbener ?? t.titel}`}
            startAccessor="start"
            endAccessor="ende"
            allDayAccessor="ganztaegig"
            view={kalView}
            onView={setKalView}
            date={kalDatum}
            onNavigate={setKalDatum}
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            min={new Date(1970, 0, 1, 6)}
            max={new Date(1970, 0, 1, 21)}
            onSelectEvent={(t: Termin) => t.link && window.open(t.link, '_blank')}
            eventPropGetter={(t: Termin) => ({ style: { backgroundColor: KATEGORIEN[t.kategorie].farbe, border: 'none' } })}
            messages={{ today: 'Heute', previous: '←', next: '→', month: 'Monat', week: 'Woche', day: 'Tag', agenda: 'Liste', noEventsInRange: 'Keine Termine', showMore: (n: number) => `+${n} weitere` }}
            style={{ height: 'calc(100vh - 230px)', minHeight: 520 }}
          />
        </section>
      )}

      {tab === 'faelle' && (
        <section className="faelle">
          {sterbefaelle(sichtbar, jetzt).map((f) => (
            <article key={f.sterbefallId} className={`fall ${f.naechster ? '' : 'erledigt'}`}>
              <h3>
                {f.name} <span className="fall-nr">#{f.sterbefallId}</span>
              </h3>
              {f.naechster && (
                <p className="naechster">
                  Nächster Termin: {KATEGORIEN[f.naechster.kategorie].label}, {format(f.naechster.start, 'EEE d.M.', { locale: de })}
                  {!f.naechster.ganztaegig && ` ${uhrzeit(f.naechster.start)}`}
                </p>
              )}
              <ol className="zeitleiste">
                {f.termine.map((t) => (
                  <li key={t.id} className={t.ende < jetzt ? 'vorbei' : ''}>
                    <TerminKarte t={t} mitDatum />
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </section>
      )}

      {tab === 'fahrten' && (
        <section className="liste">
          <h2>Fahrten der nächsten 14 Tage</h2>
          {fahrten(sichtbar, jetzt).map((t) => (
            <TerminKarte key={t.id} t={t} mitDatum />
          ))}
          {fahrten(sichtbar, jetzt).length === 0 && <p className="leer">Keine Fahrten geplant</p>}
        </section>
      )}

      {tab === 'hinweise' && (
        <section className="liste">
          <h2>Hinweise</h2>
          {hinweise.length === 0 && <p className="leer">Keine Auffälligkeiten 👍</p>}
          {hinweise.map((w, i) => (
            <div key={i} className={`warnung ${w.art}`}>
              <strong>{w.art === 'ueberschneidung' ? 'Überschneidung' : w.art === 'ohneUhrzeit' ? 'Ohne Uhrzeit' : 'Reihenfolge'}</strong>
              <span>{w.text}</span>
              <small>{w.termine.map((t) => format(t.start, t.ganztaegig ? 'd.M.' : 'd.M. HH:mm')).join(' / ')}</small>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
