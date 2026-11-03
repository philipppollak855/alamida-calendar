import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './planung.css';
import { useTheme } from './theme';
import NeuerTerminDialog from './NeuerTerminDialog';
import { abmelden, anmeldungAbschliessen, einteilungSpeichern, terminLoeschen, hubAnmelden, ichLaden, termineAusCache, termineLaden, type EinteilungRecht, type Ich } from './api';
import AdminAnsicht from './AdminAnsicht';
import AbwesenheitAnsicht, { AbwesenheitZeile, abwesendAm, useAbwesenheit } from './AbwesenheitAnsicht';
import BereitschaftAnsicht, { BereitschaftZeile, NACH_ANMELDUNG, bereitschaftAm, useBereitschaft } from './BereitschaftAnsicht';
import MobileAnsicht from './MobileAnsicht';
import { useInstallieren } from './useInstallieren';
import { demoTermine } from './demoDaten';
import TerminDetail from './TerminDetail';
import FallKarte from './FallKarte';
import {
  GRUPPEN,
  KATEGORIEN,
  checkliste,
  countdown,
  fahrten,
  nachGruppe,
  orte,
  plusTage,
  startDesTages,
  sterbefaelle,
  suche,
  termineAmTag,
  warnungen,
  type Gruppe,
  type Kategorie,
  type Termin, personalText, bloecke } from './planungLogic';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }), getDay, locales: { de } });

type Tab = 'tag' | 'kalender' | 'faelle' | 'fahrten' | 'orte' | 'hinweise' | 'bereitschaft' | 'abwesenheit' | 'admin';

const TABS: { id: Tab; label: string; icon: string; taste: string }[] = [
  { id: 'tag', label: 'Tagesplan', icon: '◐', taste: '1' },
  { id: 'kalender', label: 'Kalender', icon: '▦', taste: '2' },
  { id: 'faelle', label: 'Sterbefälle', icon: '✦', taste: '3' },
  { id: 'fahrten', label: 'Fahrten', icon: '➜', taste: '4' },
  { id: 'orte', label: 'Orte', icon: '⌖', taste: '5' },
  { id: 'hinweise', label: 'Hinweise', icon: '⚑', taste: '6' },
  { id: 'bereitschaft', label: 'Bereitschaft', icon: '🛡', taste: '7' },
  { id: 'abwesenheit', label: 'Urlaub / Krank', icon: '🌴', taste: '8' },
];
const GRUPPEN_ICON: Record<Gruppe, string> = { Zeremonien: '🕯️', Fahrten: '🚐', 'Gespräche': '💬', Sonstiges: '📌' };

const uhrzeit = (d: Date) => format(d, 'HH:mm');

function useMobil(): boolean {
  const abfrage = '(max-width: 860px)';
  const [mobil, setMobil] = useState(() => window.matchMedia(abfrage).matches);
  useEffect(() => {
    const m = window.matchMedia(abfrage);
    const onChange = () => setMobil(m.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);
  return mobil;
}

export function TerminKarte({ t, mitDatum = false, onOeffnen }: { t: Termin; mitDatum?: boolean; onOeffnen: (t: Termin) => void }) {
  const k = KATEGORIEN[t.kategorie];
  const cd = countdown(t, new Date());
  return (
    <button
      className={`termin ${cd === 'läuft' ? 'laeuft' : ''} ${t.ende < new Date() ? 'vorbei' : ''}`}
      style={{ ['--kat' as string]: k.farbe }}
      onClick={() => onOeffnen(t)}
    >
      <div className="termin-zeit">
        <span>
          {mitDatum && `${format(t.start, 'EEE d.M.', { locale: de })} · `}
          {t.ganztaegig ? 'ganztägig' : `${uhrzeit(t.start)} – ${uhrzeit(t.ende)}`}
          {t.details.imAnschluss && ' · im Anschluss'}
        </span>
        {cd && <span className={`countdown ${cd === 'läuft' ? 'live' : ''}`}>{cd}</span>}
      </div>
      <div className="termin-titel">
        <span className="termin-symbol">{k.symbol}</span>
        <span>
          <span className="termin-art">{t.details.art ?? k.label}</span>
          {t.verstorbener && <strong> {t.verstorbener}</strong>}
        </span>
      </div>
      {t.details.route ? (
        <div className="termin-ort">🧭 {t.details.route}</div>
      ) : (
        t.ort && <div className="termin-ort">📍 {t.ort}</div>
      )}
      {!t.verstorbener && <div className="termin-ort">{t.titel}</div>}
      {t.details.bestattungsart && <div className="termin-ort druck-nur">{t.details.bestattungsart}</div>}
      {!!t.personal?.length && <div className="termin-ort termin-personal">👥 {personalText(t)}</div>}
    </button>
  );
}

interface PaletteEintrag {
  id: string;
  icon: string;
  text: string;
  sub?: string;
  aktion: () => void;
}

function Palette({ eintraege, onSchliessen }: { eintraege: (q: string) => PaletteEintrag[]; onSchliessen: () => void }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const liste = eintraege(q);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => setI(0), [q]);
  return (
    <div className="modal-hintergrund oben" onClick={onSchliessen}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          value={q}
          placeholder="Suchen oder Befehl … (Name, Nr., Ort, „heute“, „drucken“)"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onSchliessen();
            if (e.key === 'ArrowDown') setI((x) => Math.min(x + 1, liste.length - 1));
            if (e.key === 'ArrowUp') setI((x) => Math.max(x - 1, 0));
            if (e.key === 'Enter' && liste[i]) {
              onSchliessen();
              liste[i].aktion();
            }
          }}
        />
        <ul>
          {liste.map((e, n) => (
            <li key={e.id}>
              <button
                className={n === i ? 'aktiv' : ''}
                onMouseEnter={() => setI(n)}
                onClick={() => {
                  onSchliessen();
                  e.aktion();
                }}
              >
                <span className="p-icon">{e.icon}</span>
                <span className="p-text">{e.text}</span>
                {e.sub && <span className="p-sub">{e.sub}</span>}
              </button>
            </li>
          ))}
          {liste.length === 0 && <li className="leer">Nichts gefunden</li>}
        </ul>
        <div className="palette-fuss">↑↓ auswählen · ↵ öffnen · Esc schließen</div>
      </div>
    </div>
  );
}

export default function PlanungPage() {
  const cache = termineAusCache();
  const [ich, setIch] = useState<Ich | null>(null);
  const [termine, setTermine] = useState<Termin[]>(() => cache?.termine ?? demoTermine());
  const [fehler, setFehler] = useState<string | null>(() => new URLSearchParams(location.search).get('fehler'));
  const [laedt, setLaedt] = useState(false);
  const [stand, setStand] = useState<Date | null>(cache?.zeit ?? null);
  const [tab, setTab] = useState<Tab>('tag');
  const [tag, setTag] = useState(() => startDesTages(new Date()));
  const [kalView, setKalView] = useState<View>(Views.WEEK);
  const [kalDatum, setKalDatum] = useState(new Date());
  const [aus, setAus] = useState<Kategorie[]>([]);
  const [suchtext, setSuchtext] = useState('');
  const [offen, setOffen] = useState<Termin | null>(null);
  const [einteilung, setEinteilung] = useState<EinteilungRecht | null>(null);
  const [neu, setNeu] = useState<{ datum: string; zeit?: string } | null>(null);
  const [palette, setPalette] = useState(false);
  const [hilfe, setHilfe] = useState(false);
  const [echteDaten, setEchteDaten] = useState(!!cache);
  const mobil = useMobil();
  const install = useInstallieren();
  const [iosHilfe, setIosHilfe] = useState(false);
  const [theme, setTheme] = useTheme();
  const [jetzt, setJetzt] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setJetzt(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);


  const freigeschaltet = !!ich?.rechte?.freigeschaltet;
  const bereitschaft = useBereitschaft(freigeschaltet);
  const abwesenheit = useAbwesenheit(freigeschaltet);
  const tabs = useMemo(
    () => (ich?.rechte?.admin ? [...TABS, { id: 'admin' as Tab, label: 'Rechte', icon: '⚿', taste: '9' }] : TABS),
    [ich],
  );

  const zielTermin = useRef<string | null>(null);
  useEffect(() => {
    if (!zielTermin.current || !echteDaten) return;
    const t = termine.find((x) => x.id === zielTermin.current);
    if (t) {
      zielTermin.current = null;
      setOffen(t);
    }
  }, [termine, echteDaten]);

  const laden = useCallback(async () => {
    if (!freigeschaltet) return;
    setLaedt(true);
    try {
      const r = await termineLaden();
      setTermine(r.termine);
      setEinteilung(r.einteilung);
      setEchteDaten(true);
      setStand(new Date());
      setFehler(r.fehler.length ? r.fehler.join(' · ') : null);
    } catch (e) {
      setFehler(navigator.onLine ? (e as Error).message : 'Offline – angezeigt wird der zuletzt geladene Stand.');
      if ((e as Error).message === 'nicht angemeldet') setIch({ angemeldet: false });
    } finally {
      setLaedt(false);
    }
  }, [freigeschaltet]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const state = params.get('state');
    const hubTicket = new URLSearchParams(location.hash.slice(1)).get('hub_ticket');
    // Direktlink, z. B. aus dem Tages-Dashboard des Hubs: ?tag=JJJJ-MM-TT&termin=<kalenderId>/<eventId>
    const zielTag = /^\d{4}-\d{2}-\d{2}$/.test(params.get('tag') ?? '') ? params.get('tag')! : null;
    if (zielTag) {
      const [j, m, t] = zielTag.split('-').map(Number);
      setTag(new Date(j, m - 1, t));
      setTab('tag');
    }
    zielTermin.current = params.get('termin');
    if (location.search || location.hash) history.replaceState(null, '', '/');
    (hubTicket
      ? hubAnmelden(hubTicket).catch((e: Error) => setFehler(e.message))
      : code && state
        ? anmeldungAbschliessen(code, state).catch((e: Error) => setFehler(e.message))
        : Promise.resolve()
    )
      .then(() => ichLaden())
      .then((i) => {
        const ziel = localStorage.getItem(NACH_ANMELDUNG);
        localStorage.removeItem(NACH_ANMELDUNG);
        if (i.angemeldet && (ziel === '/bereitschaft' || ziel === '/abwesenheit')) return location.replace(ziel);
        setIch(i);
        if (!i.angemeldet || !i.rechte?.freigeschaltet) {
          setEchteDaten(false);
          setTermine(demoTermine());
        }
      })
      .catch(() => setIch({ angemeldet: false }));
  }, []);

  useEffect(() => {
    void laden();
    if (!freigeschaltet) return;
    const timer = setInterval(() => void laden(), 60_000);
    const onFocus = () => void laden();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [laden, freigeschaltet]);

  const anmelden = () => {
    window.location.href = '/api/auth/login';
  };

  async function onAbmelden() {
    await abmelden();
    setIch({ angemeldet: false });
    setEchteDaten(false);
    setTermine(demoTermine());
    setStand(null);
  }

  async function onInstallieren() {
    if (install.ios) setIosHilfe(true);
    else await install.installieren();
  }

  const vollbild = () =>
    document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.();

  const einteilen = useCallback(async (t: Termin, emails: string[]) => {
    const r = await einteilungSpeichern(t.id, emails);
    const personal = r.personen.length ? r.personen : undefined;
    setTermine((l) => l.map((x) => (x.id === t.id ? { ...x, personal } : x)));
    setOffen((o) => (o && o.id === t.id ? { ...o, personal } : o));
  }, []);

  const loeschen = useCallback(async (t: Termin) => {
    if (!confirm(`Termin „${t.titel}“ wirklich löschen?`)) return;
    await terminLoeschen(t.id);
    setTermine((l) => l.filter((x) => x.id !== t.id));
    setOffen(null);
  }, []);

  const geheZu = useCallback((t: Termin) => {
    setTag(startDesTages(t.start));
    setOffen(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((x) => !x);
        return;
      }
      const ziel = e.target as HTMLElement;
      if (offen || palette || ['INPUT', 'TEXTAREA', 'SELECT'].includes(ziel.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      const tabTaste = tabs.find((x) => x.taste === e.key);
      if (tabTaste) setTab(tabTaste.id);
      else if (e.key === '/') {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === '?') setHilfe((x) => !x);
      else if (e.key.toLowerCase() === 't') {
        setTag(startDesTages(new Date()));
        setKalDatum(new Date());
      } else if (e.key.toLowerCase() === 'd') setTheme((x) => (x === 'dunkel' ? 'hell' : 'dunkel'));
      else if (e.key.toLowerCase() === 'f') vollbild();
      else if (e.key.toLowerCase() === 'p') window.print();
      else if (e.key.toLowerCase() === 'r') void laden();
      else if (tab === 'tag' && (e.key === 'ArrowLeft' || e.key === 'j')) setTag((d) => plusTage(d, -1));
      else if (tab === 'tag' && (e.key === 'ArrowRight' || e.key === 'k')) setTag((d) => plusTage(d, 1));
      else if (e.key === 'Escape') setHilfe(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offen, palette, tab, laden, tabs]);

  const gefiltert = useMemo(() => suche(termine.filter((t) => !aus.includes(t.kategorie)), suchtext), [termine, aus, suchtext]);
  const hinweise = useMemo(() => warnungen(gefiltert, new Date()), [gefiltert]);
  const tagTermine = termineAmTag(gefiltert, tag);
  const tagBloecke = bloecke(tagTermine);
  const tagFaelle = tagBloecke.filter((b) => b.art === 'fall');
  const tagGruppen = nachGruppe(tagBloecke.flatMap((b) => (b.art === 'einzel' ? [b.termin] : [])));
  const spalten: Gruppe[] = [...GRUPPEN, ...(tagGruppen.Sonstiges.length ? (['Sonstiges'] as Gruppe[]) : [])];
  const istHeute = isSameDay(tag, jetzt);
  const heute = termineAmTag(gefiltert, jetzt);
  const naechster = gefiltert
    .filter((t) => !t.ganztaegig && t.start > jetzt)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  const fahrtenListe = fahrten(gefiltert, jetzt);
  const faelle = sterbefaelle(gefiltert, jetzt);
  const orteListe = orte(gefiltert, jetzt);
  const zaehler: Partial<Record<Tab, number>> = {
    tag: heute.length,
    faelle: faelle.filter((f) => f.naechster).length,
    fahrten: fahrtenListe.length,
    hinweise: hinweise.length,
  };

  const paletteEintraege = (q: string): PaletteEintrag[] => {
    const befehle: PaletteEintrag[] = [
      ...tabs.map((x) => ({ id: `tab-${x.id}`, icon: x.icon, text: `Gehe zu ${x.label}`, sub: x.taste, aktion: () => setTab(x.id) })),
      { id: 'heute', icon: '◉', text: 'Heute', sub: 'T', aktion: () => { setTag(startDesTages(new Date())); setTab('tag'); } },
      { id: 'morgen', icon: '→', text: 'Morgen', aktion: () => { setTag(plusTage(startDesTages(new Date()), 1)); setTab('tag'); } },
      { id: 'drucken', icon: '🖨', text: 'Tagesplan drucken', sub: 'P', aktion: () => { setTab('tag'); setTimeout(() => window.print(), 100); } },
      { id: 'theme', icon: '◑', text: theme === 'dunkel' ? 'Helles Design' : 'Dunkles Design', sub: 'D', aktion: () => setTheme(theme === 'dunkel' ? 'hell' : 'dunkel') },
      { id: 'vollbild', icon: '⛶', text: 'Vollbild / Wandmodus', sub: 'F', aktion: vollbild },
      { id: 'neu', icon: '↻', text: 'Jetzt aktualisieren', sub: 'R', aktion: () => void laden() },
    ];
    const ql = q.trim().toLowerCase();
    const b = ql ? befehle.filter((x) => x.text.toLowerCase().includes(ql)) : befehle.slice(6, 10);
    const treffer = ql
      ? suche(termine, q)
          .sort((a, b2) => Math.abs(a.start.getTime() - Date.now()) - Math.abs(b2.start.getTime() - Date.now()))
          .slice(0, 8)
          .map((t) => ({
            id: t.id,
            icon: KATEGORIEN[t.kategorie].symbol,
            text: `${t.details.art ?? KATEGORIEN[t.kategorie].label} ${t.verstorbener ?? t.titel}`,
            sub: format(t.start, t.ganztaegig ? 'EEE d.M.' : 'EEE d.M. HH:mm', { locale: de }),
            aktion: () => geheZu(t),
          }))
      : [];
    return [...treffer, ...b];
  };

  const begruessung = jetzt.getHours() < 11 ? 'Guten Morgen' : jetzt.getHours() < 18 ? 'Guten Tag' : 'Guten Abend';

  const detail = offen && (
    <TerminDetail
      termin={offen}
      alle={termine}
      hinweise={hinweise}
      einteilung={echteDaten ? einteilung : null}
      onEinteilen={einteilen}
      onLoeschen={
        echteDaten && offen.details.quelle === 'web' && (offen.details.angelegtVon === ich?.benutzer?.email?.toLowerCase() || ich?.rechte?.admin)
          ? loeschen
          : undefined
      }
      onWaehlen={setOffen}
      onSchliessen={() => setOffen(null)}
    />
  );
  const darfAnlegen = echteDaten && !!ich?.anlegen?.darf;
  const neuDialog = neu && ich?.anlegen && (
    <NeuerTerminDialog
      datum={neu.datum}
      zeit={neu.zeit}
      dauer={ich.anlegen.dauer}
      onSchliessen={() => setNeu(null)}
      onAngelegt={(t) => {
        setTermine((l) => [...l, t]);
        setNeu(null);
        setOffen(t);
      }}
    />
  );
  const iosDialog = iosHilfe && (
    <div className="modal-hintergrund" onClick={() => setIosHilfe(false)}>
      <div className="hilfe glas" onClick={(e) => e.stopPropagation()}>
        <h2>App installieren</h2>
        <ol className="ios-schritte">
          <li>Unten in Safari auf <strong>Teilen</strong> (□↑) tippen</li>
          <li><strong>„Zum Home-Bildschirm“</strong> wählen</li>
          <li><strong>Hinzufügen</strong> tippen</li>
        </ol>
        <button className="knopf primaer" onClick={() => setIosHilfe(false)}>Verstanden</button>
      </div>
    </div>
  );

  if (mobil) {
    return (
      <div className={`planung mobil theme-${theme}`}>
        <MobileAnsicht
          termine={gefiltert}
          alle={termine}
          hinweise={hinweise}
          ich={ich}
          stand={stand}
          laedt={laedt}
          fehler={fehler}
          demo={!echteDaten}
          theme={theme}
          installMoeglich={install.moeglich}
          onTheme={() => setTheme(theme === 'dunkel' ? 'hell' : 'dunkel')}
          onLaden={() => void laden()}
          onAnmelden={anmelden}
          onAbmelden={onAbmelden}
          onInstallieren={onInstallieren}
          onOeffnen={setOffen}
          onNeu={darfAnlegen ? (datum) => setNeu({ datum }) : undefined}
          bereitschaft={bereitschaft.daten?.eintraege ?? []}
        />
        {detail}
        {neuDialog}
        {iosDialog}
      </div>
    );
  }

  return (
    <div className={`planung theme-${theme}`}>
      <aside className="seitenleiste">
        <div className="marke">
          <div className="marke-logo">A</div>
          <div>
            <div className="marke-name">Alamida</div>
            <div className="marke-sub">Planung</div>
          </div>
        </div>
        <nav>
          {tabs.map((x) => (
            <button key={x.id} className={tab === x.id ? 'aktiv' : ''} onClick={() => setTab(x.id)} title={`${x.label} (${x.taste})`}>
              <span className="nav-icon">{x.icon}</span>
              <span className="nav-label">{x.label}</span>
              {!!zaehler[x.id] && <span className={`nav-zahl ${x.id === 'hinweise' ? 'warn' : ''}`}>{zaehler[x.id]}</span>}
            </button>
          ))}
        </nav>
        <div className="seitenleiste-fuss">
          <button onClick={() => setTheme(theme === 'dunkel' ? 'hell' : 'dunkel')} title="Design wechseln (D)">
            {theme === 'dunkel' ? '☀' : '☾'}
          </button>
          <button onClick={vollbild} title="Vollbild (F)">⛶</button>
          <button onClick={() => setHilfe(true)} title="Tastenkürzel (?)">⌨</button>
          {install.moeglich && (
            <button onClick={onInstallieren} title="Als App installieren">⤓</button>
          )}
        </div>
        {ich?.angemeldet && (
          <div className="konto">
            {ich.benutzer?.bild ? <img src={ich.benutzer.bild} alt="" referrerPolicy="no-referrer" /> : <div className="avatar klein-avatar">{(ich.benutzer?.name ?? ich.benutzer?.email ?? '?')[0]}</div>}
            <div className="konto-text">
              <div>{ich.benutzer?.name ?? ich.benutzer?.email}</div>
              <div className="klein">{ich.rechte?.admin ? 'Administrator' : (ich.gruppenNamen ?? []).join(', ') || 'ohne Gruppe'}</div>
            </div>
            <button onClick={onAbmelden} title="Abmelden">⏻</button>
          </div>
        )}
      </aside>

      <main className="hauptbereich">
        <header className="kopfzeile">
          <div>
            <div className="gruss">{begruessung}</div>
            <h1>
              {format(jetzt, 'EEEE, d. MMMM', { locale: de })} <span className="uhr">{uhrzeit(jetzt)}</span>
            </h1>
          </div>
          <button className="suchfeld" onClick={() => setPalette(true)}>
            <span>⌕</span> Suchen oder springen … <kbd>Strg K</kbd>
          </button>
          <div className="kopf-aktionen">
            {stand && <span className="stand">● Live · {uhrzeit(stand)}</span>}
            {install.moeglich && (
              <button className="knopf" onClick={onInstallieren}>
                ⤓ App installieren
              </button>
            )}
            {!ich?.angemeldet ? (
              <button className="knopf primaer" onClick={anmelden}>
                Mit Google anmelden
              </button>
            ) : (
              freigeschaltet && (
                <button className="knopf" onClick={() => void laden()} disabled={laedt}>
                  <span className={laedt ? 'dreht' : ''}>↻</span> Aktualisieren
                </button>
              )
            )}
          </div>
        </header>

        {ich?.angemeldet && !freigeschaltet && (
          <div className="banner">
            Angemeldet als <strong>{ich.benutzer?.email}</strong> – noch keine Freigabe. Bitte einen Administrator, dich unter „Rechte“ einer Gruppe zuzuordnen.
          </div>
        )}
        {ich && !ich.angemeldet && <div className="banner">Beispieldaten – nach der Anmeldung erscheinen eure echten Termine.</div>}
        {fehler && <div className="banner fehler">{fehler}</div>}

        <section className="kennzahlen">
          <div className="kachel glas">
            <div className="kachel-label">Heute</div>
            <div className="kachel-wert">{heute.length}</div>
            <div className="kachel-sub">Termine</div>
          </div>
          <div className="kachel glas">
            <div className="kachel-label">Zeremonien heute</div>
            <div className="kachel-wert">{nachGruppe(heute).Zeremonien.length}</div>
            <div className="kachel-sub">Beisetzung · Feier · Rosenkranz</div>
          </div>
          <div className="kachel glas">
            <div className="kachel-label">Fahrten 14 Tage</div>
            <div className="kachel-wert">{fahrtenListe.length}</div>
            <div className="kachel-sub">davon heute {nachGruppe(heute).Fahrten.length}</div>
          </div>
          <button className={`kachel glas ${hinweise.length ? 'warn' : ''}`} onClick={() => setTab('hinweise')}>
            <div className="kachel-label">Hinweise</div>
            <div className="kachel-wert">{hinweise.length}</div>
            <div className="kachel-sub">{hinweise.length ? 'bitte prüfen' : 'alles in Ordnung'}</div>
          </button>
          {naechster && (
            <button className="kachel glas naechster" style={{ ['--kat' as string]: KATEGORIEN[naechster.kategorie].farbe }} onClick={() => geheZu(naechster)}>
              <div className="kachel-label">Nächster Termin · {countdown(naechster, jetzt) ?? format(naechster.start, 'EEE d.M.', { locale: de })}</div>
              <div className="kachel-titel">
                {KATEGORIEN[naechster.kategorie].symbol} {naechster.details.art ?? KATEGORIEN[naechster.kategorie].label} {naechster.verstorbener ?? ''}
              </div>
              <div className="kachel-sub">
                {uhrzeit(naechster.start)} · {naechster.details.route ?? naechster.ort}
              </div>
            </button>
          )}
        </section>

        <div className="filter-leiste">
          <div className="suche-inline">
            <span>⌕</span>
            <input type="search" placeholder="Filtern: Name, Nr., Ort …" value={suchtext} onChange={(e) => setSuchtext(e.target.value)} />
          </div>
          {(Object.keys(KATEGORIEN) as Kategorie[])
            .filter((k) => k !== 'Sonstiges')
            .map((k) => (
              <button
                key={k}
                className={`chip ${aus.includes(k) ? 'aus' : ''}`}
                style={{ ['--kat' as string]: KATEGORIEN[k].farbe }}
                onClick={() => setAus(aus.includes(k) ? aus.filter((x) => x !== k) : [...aus, k])}
                onDoubleClick={() => setAus((Object.keys(KATEGORIEN) as Kategorie[]).filter((x) => x !== k))}
                title="Klick: ein/aus · Doppelklick: nur diese"
              >
                <span className="chip-punkt" />
                {KATEGORIEN[k].symbol} {KATEGORIEN[k].label}
              </button>
            ))}
          {aus.length > 0 && (
            <button className="chip zuruecksetzen" onClick={() => setAus([])}>
              Alle zeigen
            </button>
          )}
        </div>

        {tab === 'tag' && (
          <section className="ansicht">
            <div className="tag-nav">
              <div className="tag-nav-knoepfe">
                <button onClick={() => setTag(plusTage(tag, -1))} title="Vorheriger Tag (←)">‹</button>
                <button className={istHeute ? 'aktiv' : ''} onClick={() => setTag(startDesTages(new Date()))}>
                  Heute
                </button>
                <button onClick={() => setTag(plusTage(tag, 1))} title="Nächster Tag (→)">›</button>
              </div>
              <h2>{format(tag, 'EEEE, d. MMMM yyyy', { locale: de })}</h2>
              <input
                type="date"
                value={format(tag, 'yyyy-MM-dd')}
                onChange={(e) => e.target.value && setTag(startDesTages(new Date(e.target.value + 'T00:00')))}
              />
              {darfAnlegen && (
                <button className="knopf primaer" onClick={() => setNeu({ datum: format(tag, 'yyyy-MM-dd') })}>
                  ＋ Termin
                </button>
              )}
              <button className="knopf" onClick={() => window.print()}>🖨 Drucken</button>
            </div>
            <BereitschaftZeile eintraege={bereitschaftAm(bereitschaft.daten?.eintraege ?? [], tag)} />
            <AbwesenheitZeile eintraege={abwesendAm(abwesenheit.daten?.eintraege ?? [], format(tag, 'yyyy-MM-dd'))} />
            <div className="wochenband">
              {Array.from({ length: 7 }, (_, n) => plusTage(startOfWeek(tag, { weekStartsOn: 1 }), n)).map((d) => {
                const anz = termineAmTag(gefiltert, d).length;
                return (
                  <button
                    key={d.toISOString()}
                    className={`${isSameDay(d, tag) ? 'aktiv' : ''} ${isSameDay(d, jetzt) ? 'heute' : ''}`}
                    onClick={() => setTag(d)}
                  >
                    <span className="wb-tag">{format(d, 'EEE', { locale: de })}</span>
                    <span className="wb-datum">{format(d, 'd')}</span>
                    <span className="wb-punkte">{'•'.repeat(Math.min(anz, 5))}</span>
                  </button>
                );
              })}
            </div>
            <div className="spalten">
              {tagFaelle.length > 0 && (
                <div className="spalte glas spalte-faelle">
                  <h3>
                    <span>✦ Sterbefälle</span>
                    <span className="anzahl">{tagFaelle.length}</span>
                  </h3>
                  {tagFaelle.map((b) => b.art === 'fall' && <FallKarte key={b.schluessel} name={b.name} sterbefallId={b.sterbefallId} termine={b.termine} onOeffnen={setOffen} />)}
                </div>
              )}
              {spalten.map((g) => {
                const liste = tagGruppen[g];
                const jetztIndex = istHeute ? liste.findIndex((t) => !t.ganztaegig && t.start > jetzt) : -1;
                return (
                  <div key={g} className="spalte glas">
                    <h3>
                      <span>
                        {GRUPPEN_ICON[g]} {g}
                      </span>
                      <span className="anzahl">{liste.length}</span>
                    </h3>
                    {liste.length === 0 && <p className="leer">Keine Termine</p>}
                    {liste.map((t, n) => (
                      <div key={t.id} className="spalte-eintrag">
                        {n === jetztIndex && (
                          <div className="jetzt-linie">
                            <span>Jetzt {uhrzeit(jetzt)}</span>
                          </div>
                        )}
                        <TerminKarte t={t} onOeffnen={setOffen} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'kalender' && (
          <section className="ansicht kalender-ansicht glas">
            <Calendar
              localizer={localizer}
              culture="de"
              events={gefiltert}
              titleAccessor={(t: Termin) => `${KATEGORIEN[t.kategorie].symbol} ${t.details.art ?? KATEGORIEN[t.kategorie].label} ${t.verstorbener ?? t.titel}`}
              tooltipAccessor={(t: Termin) => `${t.titel}\n${t.details.route ?? t.ort}`}
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
              scrollToTime={new Date(1970, 0, 1, 7)}
              formats={{
                dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
                  `${format(start, 'd. MMM', { locale: de })} – ${format(end, 'd. MMM yyyy', { locale: de })}`,
                dayHeaderFormat: (d: Date) => format(d, 'EEEE, d. MMMM yyyy', { locale: de }),
                monthHeaderFormat: (d: Date) => format(d, 'MMMM yyyy', { locale: de }),
                dayFormat: (d: Date) => format(d, 'EEE d.', { locale: de }),
                timeGutterFormat: (d: Date) => format(d, 'HH:mm'),
              }}
              onSelectEvent={(t: Termin) => setOffen(t)}
              selectable={darfAnlegen}
              onSelectSlot={(s: { start: Date }) =>
                setNeu({ datum: format(s.start, 'yyyy-MM-dd'), ...(kalView === Views.MONTH ? {} : { zeit: format(s.start, 'HH:mm') }) })
              }
              onDrillDown={(d: Date) => {
                setTag(startDesTages(d));
                setTab('tag');
              }}
              eventPropGetter={(t: Termin) => ({ style: { ['--kat' as string]: KATEGORIEN[t.kategorie].farbe } as React.CSSProperties })}
              messages={{
                today: 'Heute',
                previous: '‹',
                next: '›',
                month: 'Monat',
                week: 'Woche',
                day: 'Tag',
                agenda: 'Liste',
                date: 'Datum',
                time: 'Zeit',
                event: 'Termin',
                allDay: 'ganztägig',
                noEventsInRange: 'Keine Termine',
                showMore: (n: number) => `+${n} weitere`,
              }}
              style={{ height: 'calc(100vh - 330px)', minHeight: 560 }}
            />
          </section>
        )}

        {tab === 'faelle' && (
          <section className="ansicht raster">
            {faelle.map((f) => {
              const punkte = checkliste(f.termine);
              const fertig = punkte.filter((p) => p.erledigt).length;
              return (
                <article key={f.sterbefallId} className={`fall glas ${f.naechster ? '' : 'erledigt'}`}>
                  <div className="fall-kopf">
                    <div className="avatar">{f.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
                    <div>
                      <h3>{f.name}</h3>
                      <div className="fall-nr">
                        #{f.sterbefallId}
                        {f.termine[0]?.details.bestattungsart && ` · ${f.termine[0].details.bestattungsart}`}
                      </div>
                    </div>
                    <div className="fortschritt" style={{ ['--p' as string]: `${(fertig / punkte.length) * 100}%` }}>
                      <span>
                        {fertig}/{punkte.length}
                      </span>
                    </div>
                  </div>
                  {f.naechster && (
                    <p className="naechster-text">
                      Nächster: {f.naechster.details.art ?? KATEGORIEN[f.naechster.kategorie].label},{' '}
                      {format(f.naechster.start, 'EEE d.M.', { locale: de })}
                      {!f.naechster.ganztaegig && ` ${uhrzeit(f.naechster.start)}`}
                    </p>
                  )}
                  <ul className="checkliste">
                    {punkte.map((p) => (
                      <li key={p.label} className={p.erledigt ? 'ok' : 'offen'}>
                        {p.erledigt ? '✓' : '○'} {p.label}
                      </li>
                    ))}
                  </ul>
                  <ol className="zeitleiste">
                    {f.termine.map((t) => (
                      <li key={t.id}>
                        <TerminKarte t={t} mitDatum onOeffnen={setOffen} />
                      </li>
                    ))}
                  </ol>
                </article>
              );
            })}
            {faelle.length === 0 && <p className="leer">Keine Sterbefälle</p>}
          </section>
        )}

        {tab === 'fahrten' && (
          <section className="ansicht liste">
            <h2>Fahrten der nächsten 14 Tage</h2>
            {fahrtenListe.map((t, n) => {
              const neuerTag = n === 0 || !isSameDay(t.start, fahrtenListe[n - 1].start);
              return (
                <div key={t.id}>
                  {neuerTag && <div className="tag-trenner">{format(t.start, 'EEEE, d. MMMM', { locale: de })}</div>}
                  <TerminKarte t={t} onOeffnen={setOffen} />
                </div>
              );
            })}
            {fahrtenListe.length === 0 && <p className="leer">Keine Fahrten geplant</p>}
          </section>
        )}

        {tab === 'orte' && (
          <section className="ansicht raster">
            {orteListe.map((o) => (
              <article key={o.ort} className="fall glas">
                <div className="fall-kopf">
                  <div className="avatar">📍</div>
                  <div>
                    <h3>{o.ort}</h3>
                    <div className="fall-nr">{o.termine.length} Termine in 14 Tagen</div>
                  </div>
                </div>
                <ol className="zeitleiste">
                  {o.termine.map((t) => (
                    <li key={t.id}>
                      <TerminKarte t={t} mitDatum onOeffnen={setOffen} />
                    </li>
                  ))}
                </ol>
              </article>
            ))}
            {orteListe.length === 0 && <p className="leer">Keine Termine mit Ort</p>}
          </section>
        )}

        {tab === 'bereitschaft' && <BereitschaftAnsicht aktiv={freigeschaltet} />}
        {tab === 'abwesenheit' && <AbwesenheitAnsicht aktiv={freigeschaltet} />}

        {tab === 'admin' && ich?.rechte?.admin && <AdminAnsicht />}

        {tab === 'hinweise' && (
          <section className="ansicht liste">
            <h2>Hinweise</h2>
            {hinweise.length === 0 && <p className="leer gross">✓ Keine Auffälligkeiten</p>}
            {hinweise.map((w, i) => (
              <button key={i} className={`warnung ${w.art}`} onClick={() => geheZu(w.termine[0])}>
                <strong>{w.art === 'ueberschneidung' ? 'Überschneidung' : w.art === 'ohneUhrzeit' ? 'Ohne Uhrzeit' : 'Reihenfolge'}</strong>
                <span>{w.text}</span>
                <small>{w.termine.map((t) => format(t.start, t.ganztaegig ? 'EEE d.M.' : 'EEE d.M. HH:mm', { locale: de })).join(' / ')}</small>
              </button>
            ))}
          </section>
        )}
      </main>

      {detail}
      {neuDialog}
      {iosDialog}
      {palette && <Palette eintraege={paletteEintraege} onSchliessen={() => setPalette(false)} />}
      {hilfe && (
        <div className="modal-hintergrund" onClick={() => setHilfe(false)}>
          <div className="hilfe glas" onClick={(e) => e.stopPropagation()}>
            <h2>Tastenkürzel</h2>
            <dl>
              {[
                ['Strg K  /  /', 'Suchen & springen'],
                ['1 – 7', 'Ansicht wechseln'],
                ['← →', 'Tag zurück / vor'],
                ['T', 'Heute'],
                ['R', 'Aktualisieren'],
                ['P', 'Drucken'],
                ['D', 'Hell / Dunkel'],
                ['F', 'Vollbild (Wandmonitor)'],
                ['Esc', 'Schließen'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
