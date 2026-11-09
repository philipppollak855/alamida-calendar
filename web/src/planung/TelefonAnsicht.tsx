import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ORT_ARTEN,
  STATUS_TEXT,
  csv,
  istOffen,
  suchen,
  teilText,
  titel,
  zeitText,
  type Mitschrift,
  type MitschriftArt,
  type OrtArt,
} from '../shared/telefon';
import {
  aufnahmeDatei,
  aufnahmeEntfernen,
  aufnahmeHochladen,
  mitschriftAendern,
  mitschriftAktion,
  mitschriftAnlegen,
  mitschriftEntfernen,
  telefonLaden,
  type TelefonDaten,
} from './api';
import { herunterladen } from './beleg';

type Modus = 'neu' | 'offen' | 'archiv';

interface Entwurf {
  art: MitschriftArt;
  zeit: string;
  anrufer: string;
  nummer: string;
  notiz: string;
  verstorbener: string;
  geburtsdatum: string;
  ortArt: OrtArt;
  ort: string;
  ortNotiz: string;
  hausarzt: string;
  polizei: boolean;
  anliegen: string;
  fall: string;
}

const lokal = (ms: number) => {
  const d = new Date(ms);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const leer = (art: MitschriftArt = 'sterbefall'): Entwurf => ({
  art,
  zeit: lokal(Date.now()),
  anrufer: '',
  nummer: '',
  notiz: '',
  verstorbener: '',
  geburtsdatum: '',
  ortArt: 'zuhause',
  ort: '',
  ortNotiz: '',
  hausarzt: '',
  polizei: false,
  anliegen: '',
  fall: '',
});
const ausMitschrift = (m: Mitschrift): Entwurf => ({
  art: m.art,
  zeit: lokal(m.zeit),
  anrufer: m.anrufer,
  nummer: m.nummer,
  notiz: m.notiz,
  verstorbener: m.verstorbener ?? '',
  geburtsdatum: m.geburtsdatum ?? '',
  ortArt: m.ortArt ?? 'zuhause',
  ort: m.ort ?? '',
  ortNotiz: m.ortNotiz ?? '',
  hausarzt: m.hausarzt ?? '',
  polizei: !!m.polizei,
  anliegen: m.anliegen ?? '',
  fall: m.fall ?? '',
});
const senden = (e: Entwurf) => ({ ...e, zeit: new Date(e.zeit).getTime() });
const symbol = (m: Pick<Mitschrift, 'art'>) => (m.art === 'sterbefall' ? '✝' : '💬');
const personText = (l: { email: string; name?: string }[]) => l.map((p) => p.name || p.email).join(', ');
const ENTWURF = 'alamida.telefonEntwurf';

/** Mitschnitt: über das Mikrofon aufnehmen (Lautsprecher) oder eine Audiodatei (z. B. vom Handy) wählen. */
function Aufnehmen({ datei, setDatei, kompakt }: { datei: Blob | null; setDatei: (b: Blob | null) => void; kompakt?: boolean }) {
  const [laeuft, setLaeuft] = useState(false);
  const [sek, setSek] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const url = useMemo(() => (datei ? URL.createObjectURL(datei) : null), [datei]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  useEffect(() => {
    if (!laeuft) return;
    const t = setInterval(() => setSek((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [laeuft]);
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const start = async () => {
    setFehler(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const typ = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, { ...(typ ? { mimeType: typ } : {}), audioBitsPerSecond: 24_000 });
      const teile: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && teile.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setDatei(new Blob(teile, { type: (r.mimeType || 'audio/webm').split(';')[0] }));
        setLaeuft(false);
      };
      r.start(1000);
      rec.current = r;
      setSek(0);
      setLaeuft(true);
    } catch {
      setFehler('Kein Zugriff auf das Mikrofon');
    }
  };

  return (
    <div className="tel-aufnahme">
      {laeuft ? (
        <button type="button" className="knopf gefahr" onClick={() => rec.current?.stop()}>
          ⏹ Stopp · {Math.floor(sek / 60)}:{String(sek % 60).padStart(2, '0')}
        </button>
      ) : (
        <>
          {typeof MediaRecorder !== 'undefined' && (
            <button type="button" className="knopf" onClick={() => void start()}>
              🎙 {kompakt ? (datei ? 'Neu' : 'Aufnahme') : datei ? 'Neu aufnehmen' : 'Mitschnitt aufnehmen'}
            </button>
          )}
          <label className="knopf">
            📎{kompakt ? '' : ' Audiodatei'}
            <input type="file" accept="audio/*" hidden onChange={(e) => setDatei(e.target.files?.[0] ?? null)} />
          </label>
        </>
      )}
      {url && !laeuft && kompakt && (
        <span className="pille an">
          ✓ Mitschnitt
          <button type="button" className="tel-x" onClick={() => setDatei(null)} aria-label="Mitschnitt verwerfen">
            ✕
          </button>
        </span>
      )}
      {url && !laeuft && !kompakt && (
        <>
          <audio controls src={url} />
          <button type="button" className="knopf klein" onClick={() => setDatei(null)}>
            ✕
          </button>
        </>
      )}
      {fehler && <span className="klein ab-rot">{fehler}</span>}
    </div>
  );
}

type Block = 'zeit' | 'person' | 'ort' | 'extra' | 'anrufer' | 'anliegen' | 'notiz';
const ALLE: Record<MitschriftArt, Block[]> = {
  sterbefall: ['zeit', 'person', 'ort', 'extra', 'anrufer', 'notiz'],
  anliegen: ['zeit', 'anrufer', 'anliegen', 'notiz'],
};
const SCHRITTE: Record<MitschriftArt, { titel: string; kurz: string; bloecke: Block[] }[]> = {
  sterbefall: [
    { titel: 'Wer ist verstorben?', kurz: 'Person', bloecke: ['person'] },
    { titel: 'Wo verstorben?', kurz: 'Ort', bloecke: ['ort'] },
    { titel: 'Wer ruft an?', kurz: 'Anrufer', bloecke: ['anrufer', 'extra'] },
    { titel: 'Notiz und speichern', kurz: 'Fertig', bloecke: ['notiz', 'zeit'] },
  ],
  anliegen: [
    { titel: 'Wer ruft an?', kurz: 'Anrufer', bloecke: ['anrufer'] },
    { titel: 'Worum geht es?', kurz: 'Anliegen', bloecke: ['anliegen'] },
    { titel: 'Notiz und speichern', kurz: 'Fertig', bloecke: ['notiz', 'zeit'] },
  ],
};

function useSchmal(px = 760) {
  const [schmal, setSchmal] = useState(() => window.matchMedia(`(max-width: ${px}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const f = () => setSchmal(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [px]);
  return schmal;
}

function Felder({ e, setE, daten, neu, bloecke }: { e: Entwurf; setE: (e: Entwurf) => void; daten: TelefonDaten; neu?: boolean; bloecke?: Block[] }) {
  const f = <K extends keyof Entwurf>(k: K, v: Entwurf[K]) => setE({ ...e, [k]: v });
  const orte = useMemo(() => [...new Set(daten.mitschriften.flatMap((m) => (m.ort ? [m.ort] : [])))].slice(0, 50), [daten.mitschriften]);
  const faelle = daten.mitschriften.filter((m) => m.art === 'sterbefall').slice(0, 40);
  const teile: Record<Block, React.ReactNode> = {
    zeit: (
      <label className="ab-feld tel-zeit" key="zeit">
        Anruf um
        <span className="tel-zeit-zeile">
          <input className="feld" type="datetime-local" value={e.zeit} onChange={(x) => f('zeit', x.target.value)} />
          {neu && (
            <button type="button" className="knopf klein" onClick={() => f('zeit', lokal(Date.now()))}>
              jetzt
            </button>
          )}
        </span>
      </label>
    ),
    person: (
      <div className="ab-zeile" key="person">
        <label className="ab-feld">
          Verstorbene Person
          <input className="feld" value={e.verstorbener} placeholder="Vor- und Nachname" autoComplete="off" onChange={(x) => f('verstorbener', x.target.value)} autoFocus={neu && !bloecke} />
        </label>
        <label className="ab-feld">
          Geburtsdatum
          <input className="feld" type="date" value={e.geburtsdatum} onChange={(x) => f('geburtsdatum', x.target.value)} />
        </label>
      </div>
    ),
    ort: (
      <div className="tel-ort" key="ort">
        <div className="ab-arten tel-ort-arten">
          {ORT_ARTEN.map((o) => (
            <button key={o.id} type="button" className={`pille ${e.ortArt === o.id ? 'an' : ''}`} onClick={() => f('ortArt', o.id)}>
              {o.symbol} {o.label}
            </button>
          ))}
        </div>
        <div className="ab-zeile">
          <label className="ab-feld">
            {e.ortArt === 'zuhause' ? 'Adresse' : e.ortArt === 'sonstig' ? 'Ort' : 'Name / Adresse'}
            <input className="feld" list="tel-orte" value={e.ort} autoComplete="off" onChange={(x) => f('ort', x.target.value)} />
            <datalist id="tel-orte">
              {orte.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <label className="ab-feld">
            {e.ortArt === 'zuhause' ? 'Hinweis (Stock, Tür …)' : 'Station / Zimmer / Hinweis'}
            <input className="feld" value={e.ortNotiz} autoComplete="off" onChange={(x) => f('ortNotiz', x.target.value)} />
          </label>
        </div>
      </div>
    ),
    extra: (
      <div className="ab-zeile" key="extra">
        <label className="ab-feld">
          Hausarzt (optional)
          <input className="feld" value={e.hausarzt} autoComplete="off" onChange={(x) => f('hausarzt', x.target.value)} />
        </label>
        <button type="button" className={`pille tel-polizei ${e.polizei ? 'an' : ''}`} aria-pressed={e.polizei} onClick={() => f('polizei', !e.polizei)}>
          🚓 Polizeieinsatz {e.polizei ? '✓' : ''}
        </button>
      </div>
    ),
    anrufer: (
      <div className="ab-zeile" key="anrufer">
        <label className="ab-feld">
          Anrufer
          <input className="feld" value={e.anrufer} placeholder="z. B. Sohn, Pflegeheim, Polizei" autoComplete="off" onChange={(x) => f('anrufer', x.target.value)} />
        </label>
        <label className="ab-feld">
          Telefonnummer
          <input className="feld" type="tel" inputMode="tel" value={e.nummer} autoComplete="off" onChange={(x) => f('nummer', x.target.value)} />
        </label>
      </div>
    ),
    anliegen: (
      <div className="tel-anliegen" key="anliegen">
        <label className="ab-feld">
          Anliegen
          <textarea className="feld" rows={4} value={e.anliegen} onChange={(x) => f('anliegen', x.target.value)} autoFocus={neu && !bloecke} />
        </label>
        <label className="ab-feld">
          Gehört zu Sterbefall (optional)
          <select className="feld" value={e.fall} onChange={(x) => f('fall', x.target.value)}>
            <option value="">–</option>
            {faelle.map((m) => (
              <option key={m.id} value={m.id}>
                {titel(m)} · {zeitText(m.zeit).slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
      </div>
    ),
    notiz: <textarea key="notiz" className="feld" rows={3} placeholder="Notiz (optional)" value={e.notiz} onChange={(x) => f('notiz', x.target.value)} />,
  };
  return <>{(bloecke ?? ALLE[e.art]).filter((b) => ALLE[e.art].includes(b)).map((b) => teile[b])}</>;
}

function NeuFormular({ daten, setDaten, gespeichert }: { daten: TelefonDaten; setDaten: (d: TelefonDaten) => void; gespeichert: (id?: string) => void }) {
  const [e, setERoh] = useState<Entwurf>(() => {
    try {
      const g = JSON.parse(localStorage.getItem(ENTWURF) ?? 'null') as Entwurf | null;
      if (g?.art) return { ...leer(g.art), ...g };
    } catch {
      /* kein Entwurf */
    }
    return leer();
  });
  const [datei, setDatei] = useState<Blob | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [schritt, setSchritt] = useState(0);
  const schmal = useSchmal();
  const formRef = useRef<HTMLFormElement>(null);
  const setE = (x: Entwurf) => {
    setERoh(x);
    setMeldung(null);
  };
  useEffect(() => {
    try {
      localStorage.setItem(ENTWURF, JSON.stringify(e));
    } catch {
      /* egal */
    }
  }, [e]);
  const schritte = SCHRITTE[e.art];
  const s = Math.min(schritt, schritte.length - 1);
  useEffect(() => {
    if (!schmal) return;
    formRef.current?.querySelector<HTMLElement>('input:not([type=date]):not([type=datetime-local]), textarea')?.focus({ preventScroll: true });
  }, [s, e.art, schmal]);

  const artWahl = (a: MitschriftArt) => {
    setE({ ...e, art: a });
    setSchritt(0);
  };
  const leeren = () => {
    setE(leer(e.art));
    setDatei(null);
    setSchritt(0);
  };

  const los = async (uebergeben: boolean) => {
    setLaeuft(true);
    setMeldung(null);
    try {
      let d = await mitschriftAnlegen({ ...senden(e), uebergeben });
      let hinweis = '';
      if (datei && d.neu) {
        try {
          d = await aufnahmeHochladen(d.neu, datei);
        } catch (x) {
          hinweis = ` Der Mitschnitt konnte nicht gespeichert werden: ${(x as Error).message}`;
        }
      }
      setDaten(d);
      setERoh(leer(e.art));
      setDatei(null);
      setSchritt(0);
      localStorage.removeItem(ENTWURF);
      const an = uebergeben ? (d.bereitschaft.length ? ` und an ${personText(d.bereitschaft)} übergeben` : ' und an die Bereitschaft übergeben (gerade ist niemand eingeteilt)') : '';
      setMeldung({ ok: !hinweis, text: `Gespeichert${an}.${hinweis}` });
      if (!hinweis) gespeichert(uebergeben ? undefined : d.neu);
    } catch (x) {
      setMeldung({ ok: false, text: (x as Error).message });
    } finally {
      setLaeuft(false);
    }
  };

  const artKnoepfe = (
    <div className="tel-arten" role="tablist">
      {(['sterbefall', 'anliegen'] as const).map((a) => (
        <button key={a} type="button" role="tab" aria-selected={e.art === a} className={`tel-art ${e.art === a ? 'an' : ''}`} onClick={() => artWahl(a)}>
          <span>{a === 'sterbefall' ? '✝' : '💬'}</span>
          {a === 'sterbefall' ? 'Sterbefall' : 'Anliegen'}
        </button>
      ))}
    </div>
  );
  const speichernKnoepfe = (
    <>
      {e.art === 'sterbefall' && (
        <button type="button" className="knopf primaer" disabled={laeuft} onClick={() => void los(true)} title={daten.bereitschaft.length ? `Jetzt in Bereitschaft: ${personText(daten.bereitschaft)}` : 'Gerade ist niemand in Bereitschaft eingeteilt'}>
          🚐 {schmal ? 'An Bereitschaft' : 'Speichern & an Bereitschaft'}
        </button>
      )}
      <button type="button" className={`knopf ${e.art === 'anliegen' ? 'primaer' : ''}`} disabled={laeuft} onClick={() => void los(false)}>
        Speichern
      </button>
    </>
  );
  const meldungZeile = meldung && <div className={`banner ${meldung.ok ? '' : 'fehler'}`}>{meldung.text}</div>;

  if (schmal)
    return (
      <div className="tel-assistent">
        <div className="tel-assistent-kopf">
          {artKnoepfe}
          <div className="tel-assistent-werkzeug">
            <Aufnehmen datei={datei} setDatei={setDatei} kompakt />
            <button type="button" className="knopf klein" onClick={leeren}>
              Leeren
            </button>
          </div>
        </div>
        <div className="tel-schritte">
          {schritte.map((x, i) => (
            <button key={x.kurz} type="button" className={`tel-punkt ${i === s ? 'an' : i < s ? 'fertig' : ''}`} onClick={() => setSchritt(i)}>
              <span>{i < s ? '✓' : i + 1}</span>
              {x.kurz}
            </button>
          ))}
        </div>
        <form
          ref={formRef}
          className="glas tel-schritt ab-formular"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (s < schritte.length - 1) setSchritt(s + 1);
          }}
        >
          <h3>{schritte[s].titel}</h3>
          <Felder e={e} setE={setE} daten={daten} neu bloecke={schritte[s].bloecke} />
          {s === schritte.length - 1 && e.art === 'sterbefall' && (
            <p className="klein">Bereitschaft jetzt: {daten.bereitschaft.length ? personText(daten.bereitschaft) : 'niemand eingeteilt'}</p>
          )}
          <button type="submit" hidden />
        </form>
        {meldungZeile}
        <div className="tel-schritt-fuss">
          <button type="button" className="knopf" disabled={s === 0} onClick={() => setSchritt(s - 1)}>
            ← Zurück
          </button>
          {s < schritte.length - 1 ? (
            <>
              <button type="button" className="knopf klein tel-gleich" disabled={laeuft} onClick={() => void los(false)} title="Ohne weitere Angaben speichern">
                Speichern
              </button>
              <button type="button" className="knopf primaer" onClick={() => setSchritt(s + 1)}>
                Weiter →
              </button>
            </>
          ) : (
            speichernKnoepfe
          )}
        </div>
      </div>
    );

  return (
    <div className="glas admin-block ab-formular tel-formular">
      {artKnoepfe}
      <Felder e={e} setE={setE} daten={daten} neu />
      <Aufnehmen datei={datei} setDatei={setDatei} />
      {meldungZeile}
      <div className="ab-modal-knoepfe">
        {speichernKnoepfe}
        <button type="button" className="knopf" disabled={laeuft} onClick={leeren}>
          Leeren
        </button>
      </div>
      {e.art === 'sterbefall' && <p className="klein">Bereitschaft jetzt: {daten.bereitschaft.length ? personText(daten.bereitschaft) : 'niemand eingeteilt'}</p>}
    </div>
  );
}

function Karte({ m, oeffnen }: { m: Mitschrift; oeffnen: () => void }) {
  return (
    <button className={`glas tel-karte ${m.art} status-${m.status}`} onClick={oeffnen}>
      <span className="tel-symbol">{symbol(m)}</span>
      <span className="tel-karte-text">
        <b>
          {titel(m)} {m.polizei && '🚓'} {m.aufnahme && '🎙'}
        </b>
        <span className="klein">
          {zeitText(m.zeit)} · {m.art === 'sterbefall' ? [m.ort, m.anrufer].filter(Boolean).join(' · ') : [m.anrufer, m.nummer].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className={`pille tel-status ${m.status}`}>{STATUS_TEXT[m.status]}</span>
    </button>
  );
}

function Detail({ m, daten, setDaten, schliessen }: { m: Mitschrift; daten: TelefonDaten; setDaten: (d: TelefonDaten) => void; schliessen: () => void }) {
  const [bearbeiten, setBearbeiten] = useState<Entwurf | null>(null);
  const [abholung, setAbholung] = useState<{ kuehlraum: string; notiz: string; verstorbener: string; geburtsdatum: string; ort: string; hausarzt: string } | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const [neueAufnahme, setNeueAufnahme] = useState<Blob | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => () => void (audio && URL.revokeObjectURL(audio)), [audio]);

  const tun = async (f: () => Promise<TelefonDaten>, danach?: () => void) => {
    setLaeuft(true);
    setFehler(null);
    try {
      setDaten(await f());
      danach?.();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };
  const teilen = async () => {
    const t = teilText(m);
    try {
      if (navigator.share) await navigator.share({ title: titel(m), text: t });
      else {
        await navigator.clipboard.writeText(t);
        setFehler('In die Zwischenablage kopiert');
      }
    } catch {
      /* abgebrochen */
    }
  };
  const ort = ORT_ARTEN.find((o) => o.id === m.ortArt);
  const verknuepft = daten.mitschriften.filter((x) => x.fall === m.id);
  const fall = m.fall ? daten.mitschriften.find((x) => x.id === m.fall) : undefined;
  const zeile = (label: string, wert?: React.ReactNode) =>
    wert ? (
      <div className="tel-zeile">
        <span className="klein">{label}</span>
        <span>{wert}</span>
      </div>
    ) : null;

  return (
    <div className="modal-hintergrund" onClick={schliessen}>
      <div className="modal ab-modal tel-detail" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-kopf" style={{ background: m.art === 'sterbefall' ? '#4b5563' : '#2563eb' }}>
          <div>
            <div className="modal-kategorie">
              {symbol(m)} {m.art === 'sterbefall' ? 'Sterbefall' : 'Anliegen'} · {STATUS_TEXT[m.status]}
            </div>
            <h2>{titel(m)}</h2>
            <div className="modal-nr">
              {zeitText(m.zeit)} · aufgenommen von {m.vonName || m.von}
            </div>
          </div>
          <button className="modal-zu" onClick={schliessen} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="modal-inhalt">
          {bearbeiten ? (
            <div className="ab-formular">
              <Felder e={bearbeiten} setE={setBearbeiten} daten={daten} />
              <div className="ab-modal-knoepfe">
                <button className="knopf primaer" disabled={laeuft} onClick={() => void tun(() => mitschriftAendern(m.id, senden(bearbeiten)), () => setBearbeiten(null))}>
                  Speichern
                </button>
                <button className="knopf" onClick={() => setBearbeiten(null)}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-block">
              {m.art === 'sterbefall' ? (
                <>
                  {zeile('Geboren', m.geburtsdatum?.split('-').reverse().join('.'))}
                  {zeile('Verstorben in', [ort ? `${ort.symbol} ${ort.label}` : '', m.ort, m.ortNotiz].filter(Boolean).join(' – '))}
                  {zeile('Hausarzt', m.hausarzt)}
                  {m.polizei && zeile('Polizei', '🚓 Polizeieinsatz')}
                </>
              ) : (
                <>
                  {zeile('Anliegen', <span className="tel-umbruch">{m.anliegen}</span>)}
                  {fall && zeile('Sterbefall', `✝ ${titel(fall)}`)}
                </>
              )}
              {zeile('Anrufer', m.anrufer)}
              {zeile('Nummer', m.nummer && <a href={`tel:${m.nummer.replace(/[^\d+]/g, '')}`}>📞 {m.nummer}</a>)}
              {zeile('Notiz', m.notiz && <span className="tel-umbruch">{m.notiz}</span>)}
              {m.uebergabe && zeile('Übergeben', `${zeitText(m.uebergabe.am)}${m.uebergabe.an.length ? ` an ${personText(m.uebergabe.an)}` : ''}`)}
              {m.abholung && zeile('Abgeholt', `${zeitText(m.abholung.am)} · Kühlraum ${m.abholung.kuehlraum}${m.abholung.notiz ? ` · ${m.abholung.notiz}` : ''}`)}
              {m.geaendert && zeile('Geändert', zeitText(m.geaendert.am))}
              {verknuepft.length > 0 && zeile('Anliegen dazu', verknuepft.map((x) => `💬 ${titel(x)} (${zeitText(x.zeit)})`).join('\n'))}
            </div>
          )}

          <div className="modal-block">
            <h4>Mitschnitt</h4>
            {m.aufnahme ? (
              <div className="tel-aufnahme">
                {audio ? (
                  <audio controls autoPlay src={audio} />
                ) : (
                  <button className="knopf" disabled={laeuft} onClick={() => void aufnahmeDatei(m.id).then((b) => setAudio(URL.createObjectURL(b)), (e: Error) => setFehler(e.message))}>
                    ▶ Anhören
                  </button>
                )}
                <button
                  className="knopf klein"
                  onClick={() => void aufnahmeDatei(m.id).then((b) => herunterladen(b, `Mitschnitt ${titel(m)} ${zeitText(m.zeit).replace(/[:.,]/g, '-')}.${b.type.split('/')[1] || 'webm'}`), (e: Error) => setFehler(e.message))}
                >
                  ⬇ Herunterladen
                </button>
                {daten.darfTelefon && (
                  <button className="knopf klein gefahr" disabled={laeuft} onClick={() => confirm('Mitschnitt löschen?') && void tun(() => aufnahmeEntfernen(m.id), () => setAudio(null))}>
                    Löschen
                  </button>
                )}
              </div>
            ) : daten.darfTelefon ? (
              <>
                <Aufnehmen datei={neueAufnahme} setDatei={setNeueAufnahme} />
                {neueAufnahme && (
                  <button className="knopf primaer klein" disabled={laeuft} onClick={() => void tun(() => aufnahmeHochladen(m.id, neueAufnahme), () => setNeueAufnahme(null))}>
                    Mitschnitt speichern
                  </button>
                )}
              </>
            ) : (
              <p className="klein">Kein Mitschnitt.</p>
            )}
          </div>

          {abholung && (
            <div className="modal-block ab-formular">
              <h4>Abholung abschließen</h4>
              <label className="ab-feld">
                Eingekühlt in (Kühlraum)
                <input className="feld" list="tel-kuehlraeume" value={abholung.kuehlraum} autoFocus onChange={(e) => setAbholung({ ...abholung, kuehlraum: e.target.value })} />
                <datalist id="tel-kuehlraeume">
                  {daten.kuehlraeume.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </label>
              {!m.verstorbener && (
                <label className="ab-feld">
                  Verstorbene Person
                  <input className="feld" value={abholung.verstorbener} onChange={(e) => setAbholung({ ...abholung, verstorbener: e.target.value })} />
                </label>
              )}
              {!m.geburtsdatum && (
                <label className="ab-feld">
                  Geburtsdatum
                  <input className="feld" type="date" value={abholung.geburtsdatum} onChange={(e) => setAbholung({ ...abholung, geburtsdatum: e.target.value })} />
                </label>
              )}
              {!m.ort && (
                <label className="ab-feld">
                  Sterbeort
                  <input className="feld" value={abholung.ort} onChange={(e) => setAbholung({ ...abholung, ort: e.target.value })} />
                </label>
              )}
              {!m.hausarzt && (
                <label className="ab-feld">
                  Hausarzt
                  <input className="feld" value={abholung.hausarzt} onChange={(e) => setAbholung({ ...abholung, hausarzt: e.target.value })} />
                </label>
              )}
              <textarea className="feld" rows={2} placeholder="Notiz zur Abholung (optional)" value={abholung.notiz} onChange={(e) => setAbholung({ ...abholung, notiz: e.target.value })} />
              <div className="ab-modal-knoepfe">
                <button className="knopf primaer" disabled={laeuft || !abholung.kuehlraum.trim()} onClick={() => void tun(() => mitschriftAktion(m.id, 'abholung', abholung), () => setAbholung(null))}>
                  ✓ Abholung abgeschlossen
                </button>
                <button className="knopf" onClick={() => setAbholung(null)}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {fehler && <div className="banner fehler">{fehler}</div>}
          {!bearbeiten && !abholung && (
            <div className="ab-modal-knoepfe">
              {m.art === 'sterbefall' && m.status === 'offen' && daten.darfTelefon && (
                <button className="knopf primaer" disabled={laeuft} onClick={() => void tun(() => mitschriftAktion(m.id, 'uebergeben'))} title={`Bereitschaft jetzt: ${personText(daten.bereitschaft) || 'niemand eingeteilt'}`}>
                  🚐 An Bereitschaft übergeben
                </button>
              )}
              {m.art === 'sterbefall' && istOffen(m) && daten.darfAbholen && (
                <button className={`knopf ${m.status === 'uebergeben' ? 'primaer' : ''}`} onClick={() => setAbholung({ kuehlraum: '', notiz: '', verstorbener: '', geburtsdatum: '', ort: '', hausarzt: '' })}>
                  ❄ Abholung abschließen
                </button>
              )}
              {m.art === 'anliegen' && daten.darfTelefon && (
                <button className={`knopf ${m.status === 'offen' ? 'primaer' : ''}`} disabled={laeuft} onClick={() => void tun(() => mitschriftAktion(m.id, 'erledigt'))}>
                  {m.status === 'erledigt' ? '↺ Wieder offen' : '✓ Erledigt'}
                </button>
              )}
              <button className="knopf" onClick={() => void teilen()}>
                ↗ Teilen
              </button>
              {daten.darfTelefon && (
                <button className="knopf" onClick={() => setBearbeiten(ausMitschrift(m))}>
                  ✎ Bearbeiten
                </button>
              )}
              {daten.admin && (
                <button className="knopf gefahr" disabled={laeuft} onClick={() => confirm('Mitschrift endgültig löschen?') && void tun(() => mitschriftEntfernen(m.id), schliessen)}>
                  Löschen
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Archiv({ daten, oeffnen }: { daten: TelefonDaten; oeffnen: (id: string) => void }) {
  const [text, setText] = useState('');
  const [art, setArt] = useState<MitschriftArt | ''>('');
  const [status, setStatus] = useState<'offen' | 'fertig' | ''>('');
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  const treffer = useMemo(() => suchen(daten.mitschriften, { text, art, status, von, bis }), [daten.mitschriften, text, art, status, von, bis]);
  const [anzahl, setAnzahl] = useState(50);
  return (
    <div className="tel-archiv">
      <div className="glas admin-block tel-suche">
        <input className="feld" type="search" placeholder="🔎 Name, Nummer, Ort, Notiz …" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="ab-zeile">
          <select className="feld" value={art} onChange={(e) => setArt(e.target.value as MitschriftArt | '')}>
            <option value="">Alle Arten</option>
            <option value="sterbefall">Sterbefälle</option>
            <option value="anliegen">Anliegen</option>
          </select>
          <select className="feld" value={status} onChange={(e) => setStatus(e.target.value as 'offen' | 'fertig' | '')}>
            <option value="">Jeder Status</option>
            <option value="offen">Offen</option>
            <option value="fertig">Erledigt / abgeholt</option>
          </select>
          <label className="ab-feld">
            Von
            <input className="feld" type="date" value={von} onChange={(e) => setVon(e.target.value)} />
          </label>
          <label className="ab-feld">
            Bis
            <input className="feld" type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
          </label>
        </div>
        <div className="ab-modal-knoepfe">
          <span className="klein">{treffer.length} Treffer</span>
          <button className="knopf klein" disabled={!treffer.length} onClick={() => herunterladen(new Blob([csv(treffer)], { type: 'text/csv;charset=utf-8' }), `Telefonmitschriften ${new Date().toISOString().slice(0, 10)}.csv`)}>
            ⬇ CSV für Excel
          </button>
        </div>
      </div>
      <div className="tel-liste">
        {treffer.slice(0, anzahl).map((m) => (
          <Karte key={m.id} m={m} oeffnen={() => oeffnen(m.id)} />
        ))}
        {treffer.length > anzahl && (
          <button className="knopf" onClick={() => setAnzahl(anzahl + 100)}>
            + weitere {treffer.length - anzahl}
          </button>
        )}
        {!treffer.length && <p className="leer">Keine Mitschriften gefunden.</p>}
      </div>
    </div>
  );
}

export default function TelefonAnsicht() {
  const [daten, setDaten] = useState<TelefonDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [modus, setModus] = useState<Modus | null>(null);
  const [offen, setOffen] = useState<string | null>(() => new URLSearchParams(location.search).get('id'));

  const laden = useCallback(() => {
    telefonLaden()
      .then((d) => {
        setDaten(d);
        setFehler(d.offlineStand ? `Ohne Verbindung – Stand ${zeitText(d.offlineStand)}` : null);
      })
      .catch((e: Error) => setFehler(e.message));
  }, []);
  useEffect(() => {
    laden();
    const t = setInterval(laden, 60_000);
    return () => clearInterval(t);
  }, [laden]);
  useEffect(() => {
    if (location.search) history.replaceState(null, '', location.pathname);
  }, []);

  if (!daten) return fehler ? <div className="banner fehler">{fehler}</div> : <p className="leer">Lädt …</p>;
  const m = modus ?? (daten.darfTelefon ? 'neu' : 'offen');
  const offene = daten.mitschriften.filter(istOffen);
  const abholungen = offene.filter((x) => x.status === 'uebergeben');
  const detail = offen ? daten.mitschriften.find((x) => x.id === offen) : undefined;
  const modi: [Modus, string][] = [
    ...(daten.darfTelefon ? ([['neu', '＋ Neu']] as [Modus, string][]) : []),
    ['offen', `${daten.darfTelefon ? 'Offen' : 'Abholungen'} (${daten.darfTelefon ? offene.length : abholungen.length})`],
    ['archiv', '🗂 Archiv'],
  ];

  return (
    <div className="bereitschaft telefon">
      <div className="bereitschaft-kopf tag-kopf">
        <div>
          <h2>Telefondienst</h2>
          <p className="klein">
            {daten.darfTelefon ? 'Anrufe schnell mitschreiben, Sterbefälle an die Bereitschaft übergeben.' : 'Übergebene Sterbefälle abholen und abschließen.'} Bereitschaft jetzt:{' '}
            {daten.bereitschaft.length ? personText(daten.bereitschaft) : 'niemand eingeteilt'}
            {daten.telefonJetzt && ` · Telefon jetzt: ${daten.telefonJetzt.name || daten.telefonJetzt.email} bis ${daten.telefonJetzt.bis.slice(11, 16)}`}
          </p>
        </div>
        <div className="tag-nav-knoepfe bs-umschalter" role="tablist">
          {modi.map(([x, label]) => (
            <button key={x} role="tab" aria-selected={m === x} className={m === x ? 'aktiv' : ''} onClick={() => setModus(x)}>
              {label}
              {x === 'offen' && abholungen.length ? ' •' : ''}
            </button>
          ))}
        </div>
      </div>
      {fehler && <div className="banner fehler">{fehler}</div>}
      {daten.darfTelefon && (
        <div hidden={m !== 'neu'}>
          <NeuFormular daten={daten} setDaten={setDaten} gespeichert={(id) => id && setOffen(id)} />
        </div>
      )}
      {m === 'offen' && (
        <div className="tel-liste">
          {(daten.darfTelefon ? offene : abholungen).map((x) => (
            <Karte key={x.id} m={x} oeffnen={() => setOffen(x.id)} />
          ))}
          {!(daten.darfTelefon ? offene : abholungen).length && <p className="leer gross">✓ Nichts offen</p>}
        </div>
      )}
      {m === 'archiv' && <Archiv daten={daten} oeffnen={setOffen} />}
      {detail && <Detail key={detail.id} m={detail} daten={daten} setDaten={setDaten} schliessen={() => setOffen(null)} />}
    </div>
  );
}
