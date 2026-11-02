import { useEffect, useRef, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Ich } from './api';
import type { Einsatz } from '../shared/bereitschaft';
import { BereitschaftZeile, bereitschaftAm } from './BereitschaftAnsicht';
import {
  KATEGORIEN,
  checkliste,
  countdown,
  fahrten,
  plusTage,
  startDesTages,
  sterbefaelle,
  suche,
  termineAmTag,
  type Termin,
  type Warnung,
} from './planungLogic';

type MTab = 'heute' | 'fahrten' | 'faelle' | 'suche' | 'mehr';

interface Props {
  termine: Termin[];
  alle: Termin[];
  hinweise: Warnung[];
  ich: Ich | null;
  stand: Date | null;
  laedt: boolean;
  fehler: string | null;
  demo: boolean;
  theme: 'dunkel' | 'hell';
  installMoeglich: boolean;
  onTheme: () => void;
  onLaden: () => void;
  onAnmelden: () => void;
  onAbmelden: () => void;
  onInstallieren: () => void;
  onOeffnen: (t: Termin) => void;
  bereitschaft: Einsatz[];
}

function Zeile({ t, onOeffnen, mitDatum = false }: { t: Termin; onOeffnen: (t: Termin) => void; mitDatum?: boolean }) {
  const k = KATEGORIEN[t.kategorie];
  const cd = countdown(t, new Date());
  return (
    <button className={`m-termin ${cd === 'läuft' ? 'laeuft' : ''} ${t.ende < new Date() ? 'vorbei' : ''}`} style={{ ['--kat' as string]: k.farbe }} onClick={() => onOeffnen(t)}>
      <div className="m-zeit">
        {mitDatum && <span className="m-datum">{format(t.start, 'EEE d.M.', { locale: de })}</span>}
        <span className="m-uhr">{t.ganztaegig ? 'ganzt.' : format(t.start, 'HH:mm')}</span>
        {!t.ganztaegig && <span className="m-bis">{format(t.ende, 'HH:mm')}</span>}
      </div>
      <div className="m-inhalt">
        <div className="m-art">
          <span>{k.symbol}</span> {t.details.art ?? k.label}
          {cd && <span className={`countdown ${cd === 'läuft' ? 'live' : ''}`}>{cd}</span>}
        </div>
        <div className="m-name">{t.verstorbener ?? t.titel}</div>
        {(t.details.route ?? t.ort) && <div className="m-ort">{t.details.route ? '🧭 ' : '📍 '}{t.details.route ?? t.ort}</div>}
      </div>
      <span className="m-pfeil">›</span>
    </button>
  );
}

export default function MobileAnsicht(p: Props) {
  const [tab, setTab] = useState<MTab>('heute');
  const [tag, setTag] = useState(() => startDesTages(new Date()));
  const [q, setQ] = useState('');
  const [jetzt, setJetzt] = useState(new Date());
  const band = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setJetzt(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    band.current?.querySelector('.aktiv')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [tag, tab]);

  const heute = startDesTages(jetzt);
  const tage = Array.from({ length: 21 }, (_, n) => plusTage(heute, n - 3));
  const tagListe = termineAmTag(p.termine, tag);
  const jetztIndex = isSameDay(tag, jetzt) ? tagListe.findIndex((t) => !t.ganztaegig && t.start > jetzt) : -1;
  const fahrtenListe = fahrten(p.termine, jetzt);
  const faelle = sterbefaelle(p.termine, jetzt).filter((f) => f.naechster);
  const treffer = q.trim() ? suche(p.alle, q).sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 50) : [];

  const wischen = {
    onTouchStart: (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }),
    onTouchEnd: (e: React.TouchEvent) => {
      if (!touch.current) return;
      const dx = e.changedTouches[0].clientX - touch.current.x;
      const dy = e.changedTouches[0].clientY - touch.current.y;
      touch.current = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) setTag((d) => plusTage(d, dx < 0 ? 1 : -1));
    },
  };

  const MTABS: { id: MTab; icon: string; label: string; zahl?: number }[] = [
    { id: 'heute', icon: '◐', label: 'Tag' },
    { id: 'fahrten', icon: '➜', label: 'Fahrten', zahl: fahrtenListe.length },
    { id: 'faelle', icon: '✦', label: 'Fälle', zahl: faelle.length },
    { id: 'suche', icon: '⌕', label: 'Suche' },
    { id: 'mehr', icon: '☰', label: 'Mehr', zahl: p.hinweise.length },
  ];

  return (
    <div className="m-app">
      <header className="m-kopf">
        <div>
          <div className="gruss">{format(jetzt, 'EEEE', { locale: de })}</div>
          <h1>
            {format(jetzt, 'd. MMMM', { locale: de })} <span className="uhr">{format(jetzt, 'HH:mm')}</span>
          </h1>
        </div>
        {p.ich?.angemeldet ? (
          <button className="m-rund" onClick={p.onLaden} aria-label="Aktualisieren">
            <span className={p.laedt ? 'dreht' : ''}>↻</span>
          </button>
        ) : (
          <button className="knopf primaer" onClick={p.onAnmelden}>
            Anmelden
          </button>
        )}
      </header>
      {p.demo && <div className="banner m-banner">Beispieldaten – {p.ich?.angemeldet ? 'noch keine Freigabe' : 'bitte anmelden'}</div>}
      {p.fehler && <div className="banner fehler m-banner">{p.fehler}</div>}

      <main className="m-inhalt-bereich">
        {tab === 'heute' && (
          <>
            <div className="m-band" ref={band}>
              {tage.map((d) => {
                const anz = termineAmTag(p.termine, d).length;
                return (
                  <button key={d.toISOString()} className={`${isSameDay(d, tag) ? 'aktiv' : ''} ${isSameDay(d, jetzt) ? 'heute' : ''}`} onClick={() => setTag(d)}>
                    <span className="wb-tag">{format(d, 'EEE', { locale: de })}</span>
                    <span className="wb-datum">{format(d, 'd')}</span>
                    <span className="wb-punkte">{'•'.repeat(Math.min(anz, 4))}</span>
                  </button>
                );
              })}
            </div>
            <div className="m-tagtitel">
              <h2>{isSameDay(tag, jetzt) ? 'Heute' : format(tag, 'EEEE, d. MMMM', { locale: de })}</h2>
              <span className="klein">{tagListe.length} Termine · wischen für Tag ←→</span>
            </div>
            <BereitschaftZeile eintraege={bereitschaftAm(p.bereitschaft, tag)} />
            <div className="m-liste" {...wischen}>
              {tagListe.length === 0 && <div className="m-leer">Keine Termine 🌿</div>}
              {tagListe.map((t, n) => (
                <div key={t.id}>
                  {n === jetztIndex && (
                    <div className="jetzt-linie">
                      <span>Jetzt {format(jetzt, 'HH:mm')}</span>
                    </div>
                  )}
                  <Zeile t={t} onOeffnen={p.onOeffnen} />
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'fahrten' && (
          <div className="m-liste">
            <h2>Fahrten · 14 Tage</h2>
            {fahrtenListe.length === 0 && <div className="m-leer">Keine Fahrten geplant</div>}
            {fahrtenListe.map((t, n) => (
              <div key={t.id}>
                {(n === 0 || !isSameDay(t.start, fahrtenListe[n - 1].start)) && <div className="tag-trenner">{format(t.start, 'EEEE, d. MMMM', { locale: de })}</div>}
                <Zeile t={t} onOeffnen={p.onOeffnen} />
              </div>
            ))}
          </div>
        )}

        {tab === 'faelle' && (
          <div className="m-liste">
            <h2>Laufende Sterbefälle</h2>
            {faelle.length === 0 && <div className="m-leer">Keine laufenden Fälle</div>}
            {faelle.map((f) => {
              const punkte = checkliste(f.termine);
              const fertig = punkte.filter((x) => x.erledigt).length;
              return (
                <button key={f.sterbefallId} className="m-fall" onClick={() => f.naechster && p.onOeffnen(f.naechster)}>
                  <div className="avatar">{f.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
                  <div className="m-inhalt">
                    <div className="m-name">{f.name}</div>
                    {f.naechster && (
                      <div className="m-ort">
                        {KATEGORIEN[f.naechster.kategorie].symbol} {f.naechster.details.art ?? KATEGORIEN[f.naechster.kategorie].label} ·{' '}
                        {format(f.naechster.start, f.naechster.ganztaegig ? 'EEE d.M.' : 'EEE d.M. HH:mm', { locale: de })}
                      </div>
                    )}
                  </div>
                  <div className="fortschritt" style={{ ['--p' as string]: `${(fertig / punkte.length) * 100}%` }}>
                    <span>
                      {fertig}/{punkte.length}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {tab === 'suche' && (
          <div className="m-liste">
            <input className="m-suche" type="search" autoFocus placeholder="Name, Nr., Ort …" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && treffer.length === 0 && <div className="m-leer">Nichts gefunden</div>}
            {treffer.map((t) => (
              <Zeile key={t.id} t={t} mitDatum onOeffnen={p.onOeffnen} />
            ))}
          </div>
        )}

        {tab === 'mehr' && (
          <div className="m-liste">
            {p.ich?.angemeldet ? (
              <div className="m-karte konto">
                {p.ich.benutzer?.bild ? <img src={p.ich.benutzer.bild} alt="" referrerPolicy="no-referrer" /> : <div className="avatar">{(p.ich.benutzer?.email ?? '?')[0]}</div>}
                <div className="konto-text">
                  <div>{p.ich.benutzer?.name ?? p.ich.benutzer?.email}</div>
                  <div className="klein">{p.ich.rechte?.admin ? 'Administrator' : (p.ich.gruppenNamen ?? []).join(', ') || 'ohne Gruppe'}</div>
                </div>
                <button className="knopf" onClick={p.onAbmelden}>Abmelden</button>
              </div>
            ) : (
              <button className="knopf primaer gross" onClick={p.onAnmelden}>Mit Google anmelden</button>
            )}
            {p.ich?.rechte?.freigeschaltet && <a className="knopf gross" href="/bereitschaft">🛡 Bereitschaft planen</a>}
            {p.installMoeglich && <button className="knopf gross" onClick={p.onInstallieren}>⤓ Als App installieren</button>}
            <button className="knopf gross" onClick={p.onTheme}>{p.theme === 'dunkel' ? '☀ Helles Design' : '☾ Dunkles Design'}</button>
            {p.stand && <p className="klein">Stand {format(p.stand, 'HH:mm')} · aktualisiert sich jede Minute</p>}
            <h2>Hinweise {p.hinweise.length > 0 && `(${p.hinweise.length})`}</h2>
            {p.hinweise.length === 0 && <div className="m-leer">✓ Keine Auffälligkeiten</div>}
            {p.hinweise.map((w, i) => (
              <button key={i} className={`warnung ${w.art}`} onClick={() => p.onOeffnen(w.termine[0])}>
                <span>{w.text}</span>
                <small>{w.termine.map((t) => format(t.start, t.ganztaegig ? 'EEE d.M.' : 'EEE d.M. HH:mm', { locale: de })).join(' / ')}</small>
              </button>
            ))}
            {p.ich?.rechte?.admin && <p className="klein">Benutzer & Rechte lassen sich am PC unter „Rechte“ verwalten.</p>}
          </div>
        )}
      </main>

      <nav className="m-nav">
        {MTABS.map((x) => (
          <button key={x.id} className={tab === x.id ? 'aktiv' : ''} onClick={() => setTab(x.id)}>
            <span className="m-nav-icon">{x.icon}</span>
            <span>{x.label}</span>
            {!!x.zahl && <span className={`m-nav-zahl ${x.id === 'mehr' ? 'warn' : ''}`}>{x.zahl}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
