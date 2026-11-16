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
  kuehlraeumeFestlegen, mitschriftAktion,
  mitschriftAnlegen,
  mitschriftEntfernen,
  papierDatei,
  papierEntfernen,
  papierHochladen,
  telefonLaden,
  type TelefonDaten,
} from './api';
import { belegVorbereiten, herunterladen } from './beleg';
import { BELEG_TYPEN } from '../shared/abwesenheit';
import { PAPIER_MAX_ANZAHL, ortVorschlaege } from '../shared/telefon';

type Modus = 'neu' | 'offen' | 'archiv';

interface Entwurf {
  art: MitschriftArt;
  zeit: string;
  anrufer: string;
  nummer: string;
  notiz: string;
  verstorbener: string;
  nameUnbekannt?: boolean;
  geburtsdatum: string;
  ortArt: OrtArt;
  ort: string;
  ortNotiz: string;
  hausarzt: string;
  polizei: boolean;
  anliegen: string;
  fall: string;
  fallName: string;
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
  fallName: '',
});
const ausMitschrift = (m: Mitschrift): Entwurf => ({
  art: m.art,
  zeit: lokal(m.zeit),
  anrufer: m.anrufer,
  nummer: m.nummer,
  notiz: m.notiz,
  verstorbener: m.verstorbener ?? '',
  nameUnbekannt: m.art === 'sterbefall' && !m.verstorbener,
  geburtsdatum: m.geburtsdatum ?? '',
  ortArt: m.ortArt ?? 'zuhause',
  ort: m.ort ?? '',
  ortNotiz: m.ortNotiz ?? '',
  hausarzt: m.hausarzt ?? '',
  polizei: !!m.polizei,
  anliegen: m.anliegen ?? '',
  fall: m.fall ?? '',
  fallName: m.fallName ?? '',
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
  const orte = useMemo(() => ortVorschlaege(daten.mitschriften, e.ortArt, e.ort, 30), [daten.mitschriften, e.ortArt, e.ort]);
  // Fallauswahl: Sterbefälle aus Telefondienst und Kalender, aktive zuerst; freie Beschreibung möglich.
  const telFaelle = useMemo(() => daten.mitschriften.filter((m) => m.art === 'sterbefall'), [daten.mitschriften]);
  const faelle = useMemo(() => {
    const l = new Map<string, [string, string]>();
    const tel = (m: Mitschrift) => l.set(titel(m).toLowerCase(), [titel(m), `📞 ${zeitText(m.zeit).slice(0, 10)}${istOffen(m) ? ' · ● aktiv' : ''}`]);
    for (const m of telFaelle) if (istOffen(m)) tel(m);
    for (const x of daten.faelle ?? [])
      if (!l.has(x.name.toLowerCase())) l.set(x.name.toLowerCase(), [x.name, `${x.aktiv ? '● aktiv · ' : ''}${x.zuletzt.split('-').reverse().join('.')}`]);
    for (const m of telFaelle) if (!l.has(titel(m).toLowerCase())) tel(m);
    return [...l.values()];
  }, [telFaelle, daten.faelle]);
  const fallText = e.fallName || (e.fall ? titel(telFaelle.find((x) => x.id === e.fall) ?? ({ art: 'sterbefall' } as Mitschrift)) : '');
  const fallWaehlen = (name: string) => {
    // Nur eindeutig benannte Telefondienst-Fälle verknüpfen; gleichnamige bleiben als Text, sonst landet das Anliegen evtl. beim falschen Fall.
    const treffer = telFaelle.filter((x) => x.verstorbener && titel(x).toLowerCase() === name.trim().toLowerCase());
    setE({ ...e, fallName: name, fall: treffer.length === 1 ? treffer[0].id : '' });
  };
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
          <span className="tel-zeit-zeile">
            <input className="feld" value={e.verstorbener} disabled={e.nameUnbekannt} placeholder={e.nameUnbekannt ? 'derzeit unbekannt' : 'Vor- und Nachname'} autoComplete="off" onChange={(x) => f('verstorbener', x.target.value)} autoFocus={neu && !bloecke} />
            <button type="button" className={`knopf klein ${e.nameUnbekannt ? 'primaer' : ''}`} aria-pressed={!!e.nameUnbekannt} onClick={() => setE({ ...e, nameUnbekannt: !e.nameUnbekannt, verstorbener: '' })}>
              unbekannt
            </button>
          </span>
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
                <option key={o.ort} value={o.ort}>
                  {o.anzahl ? `${o.anzahl}×` : ''}
                </option>
              ))}
            </datalist>
          </label>
          {orte.length > 0 && (
            <div className="tel-kuehl-chips tel-ort-chips" role="group" aria-label="Orte-Schnellauswahl">
              {orte.slice(0, 6).map((o) => (
                <button key={o.ort} type="button" className="pille" onClick={() => setE({ ...e, ort: o.ort, ortArt: e.ortArt === 'zuhause' || e.ortArt === 'sonstig' ? o.art : e.ortArt })}>
                  {ORT_ARTEN.find((a) => a.id === o.art)?.symbol} {o.ort}
                </button>
              ))}
            </div>
          )}
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
          <input className="feld" list="tel-faelle" placeholder="Name tippen oder frei beschreiben" value={fallText} onChange={(x) => fallWaehlen(x.target.value)} />
          <datalist id="tel-faelle">
            {faelle.map(([name, info]) => (
              <option key={name} value={name}>
                {info}
              </option>
            ))}
          </datalist>
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
          {titel(m)} {m.polizei && '🚓'} {m.aufnahme && '🎙'} {!!m.papiere?.length && `📄${m.papiere.length}`}
        </b>
        <span className="klein">
          {zeitText(m.zeit)} · {m.art === 'sterbefall' ? [m.ort, m.anrufer].filter(Boolean).join(' · ') : [m.anrufer, m.nummer].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className={`pille tel-status ${m.status}`}>{STATUS_TEXT[m.status]}</span>
    </button>
  );
}

type Reiter = 'fall' | 'nav' | 'akte';
const REITER: { id: Reiter; text: string }[] = [
  { id: 'fall', text: '✝ Einsatz' },
  { id: 'nav', text: '🧭 Navigation' },
  { id: 'akte', text: '✓ Abschluss' },
];

function Detail({ m, daten, setDaten, schliessen }: { m: Mitschrift; daten: TelefonDaten; setDaten: (d: TelefonDaten) => void; schliessen: () => void }) {
  const [bearbeiten, setBearbeiten] = useState<Entwurf | null>(null);
  const [abholung, setAbholung] = useState<{ kuehlraum: string; notiz: string; verstorbener: string; geburtsdatum: string; ort: string; hausarzt: string } | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const [neueAufnahme, setNeueAufnahme] = useState<Blob | null>(null);
  const [fehlt, setFehlt] = useState<string[] | null>(null);
  const [kuehlListe, setKuehlListe] = useState<string | null>(null);
  const [reiter, setReiter] = useState<Reiter>(() => (m.abholung ? 'akte' : 'fall'));
  const wisch = useRef<{ x: number; y: number } | null>(null);
  const [karteAn, setKarteAn] = useState(false);
  const [mehr, setMehr] = useState(false);
  const [nachtragOffen, setNachtragOffen] = useState<'hausarzt' | 'geburtsdatum' | null>(null);
  const [standort, setStandort] = useState<{ lat: number; lng: number } | 'sucht' | 'fehlt' | null>(null);
  const routeHolen = () => {
    if (!navigator.geolocation) return setStandort('fehlt');
    setStandort('sucht');
    navigator.geolocation.getCurrentPosition(
      (p) => setStandort({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setStandort('fehlt'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };
  useEffect(() => {
    if (reiter !== 'nav') return;
    setKarteAn(true);
    if (standort === null && m.ort?.trim()) routeHolen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reiter]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => () => void (audio && URL.revokeObjectURL(audio)), [audio]);

  const kuehlWahl = [...new Set([...(daten.kuehlraeumeFest ?? []), ...daten.kuehlraeume])].slice(0, 20);
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
  const cockpit = m.art === 'sterbefall' && !bearbeiten;
  const schritte = [
    { text: 'Aufgenommen', fertig: true, wann: zeitText(m.zeit) },
    { text: 'Bereitschaft', fertig: !!m.uebergabe, wann: m.uebergabe ? zeitText(m.uebergabe.am) : undefined },
    { text: 'Abgeholt', fertig: !!m.abholung, wann: m.abholung ? zeitText(m.abholung.am) : undefined },
  ];
  const hinweise = [
    ...(m.hausarzt ? [] : ['⚠ Hausarzt fehlt']),
    ...(m.abholung && !m.abholung.kuehlraum ? ['⚠ Kühlraum fehlt'] : []),
    ...(m.abholung?.kuehlraum ? [`❄ ${m.abholung.kuehlraum}`] : []),
    ...(m.polizei ? ['🚓 Polizei'] : []),
  ];
  const nachtragen = (feld: 'hausarzt' | 'geburtsdatum', wert: string) => {
    const v = wert.trim();
    if (v && v !== (m[feld] ?? '')) void tun(() => mitschriftAendern(m.id, senden({ ...ausMitschrift(m), [feld]: v })));
  };
  const fehltFeld = (label: string, feld: 'hausarzt' | 'geburtsdatum', typ: 'text' | 'date') =>
    m.art === 'sterbefall' && !m[feld] ? (
      <form
        className="tel-zeile tel-nachtrag"
        onSubmit={(e) => {
          e.preventDefault();
          nachtragen(feld, (e.currentTarget.elements.namedItem('wert') as HTMLInputElement).value);
        }}
      >
        <span className="klein">⚠ {label}</span>
        <input name="wert" type={typ} className="feld" placeholder="gleich hier nachtragen" aria-label={label} />
        <button className="knopf" disabled={laeuft} title="Speichern">
          ✓
        </button>
      </form>
    ) : null;
  const naechster =
    m.art !== 'sterbefall' ? null : m.abholung ? '✓ Einsatz abgeschlossen' : m.status === 'offen' ? 'An die Bereitschaft übergeben' : 'Verstorbene abholen, dann „Abholung abschließen“';
  const navZiel = m.ort?.trim() ?? '';
  const seit = (t: number) => {
    const min = Math.max(0, Math.round((Date.now() - t) / 60_000));
    return min < 60 ? `${min} Min` : `${Math.floor(min / 60)} h ${min % 60} Min`;
  };
  const abholungStarten = () => {
    setReiter('akte');
    setAbholung({ kuehlraum: '', notiz: '', verstorbener: '', geburtsdatum: '', ort: '', hausarzt: '' });
  };
  const phase = m.abholung
    ? { icon: '✓', text: 'Einsatz abgeschlossen', sub: `abgeholt ${zeitText(m.abholung.am)}${m.abholung.kuehlraum ? ` · ❄ ${m.abholung.kuehlraum}` : ''}` }
    : m.status === 'offen'
      ? { icon: '📞', text: 'Noch nicht übergeben', sub: `Anruf vor ${seit(m.zeit)}` }
      : { icon: '🚐', text: 'Abholung offen', sub: `übergeben vor ${seit(m.uebergabe?.am ?? m.zeit)}${m.uebergabe?.an.length ? ` an ${personText(m.uebergabe.an)}` : ''}` };
  const kachel = (icon: string, klein: string, gross: React.ReactNode, extra?: React.ReactNode) => (
    <>
      <span className="tel-k-icon">{icon}</span>
      <span className="tel-k-text">
        <small>{klein}</small>
        <b>{gross}</b>
        {extra}
      </span>
    </>
  );
  const weiter = (r: Reiter, text: string) => (
    <button type="button" className="knopf tel-weiter" onClick={() => setReiter(r)}>
      {text} ›
    </button>
  );
  const wischStart = (e: React.TouchEvent) => (wisch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const wischEnde = (e: React.TouchEvent) => {
    const w = wisch.current;
    wisch.current = null;
    if (!w || !cockpit || (e.target as HTMLElement).closest('input, textarea, select, iframe, audio')) return;
    const dx = e.changedTouches[0].clientX - w.x;
    if (Math.abs(dx) < 70 || Math.abs(e.changedTouches[0].clientY - w.y) > 50) return;
    const i = REITER.findIndex((r) => r.id === reiter) + (dx < 0 ? 1 : -1);
    if (REITER[i]) setReiter(REITER[i].id);
  };
  const zeile = (label: string, wert?: React.ReactNode, neben?: boolean) =>
    wert ? (
      <div className={`tel-zeile ${neben ? 'tel-neben' : ''}`}>
        <span className="klein">{label}</span>
        <span>{wert}</span>
      </div>
    ) : null;

  return (
    <div className="modal-hintergrund" onClick={schliessen}>
      <div
        className={`modal ab-modal tel-detail ${cockpit ? 'tel-cockpit' : ''} ${abholung ? 'mit-abholung' : ''} ${mehr ? 'mehr-offen' : ''}`}
        data-reiter={reiter}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
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
        {cockpit && (
          <div className="tel-cockpit-leiste">
            <ol className="tel-schritte" aria-label="Ablauf">
              {schritte.map((x) => (
                <li key={x.text} className={x.fertig ? 'fertig' : ''} title={x.wann}>
                  <span>{x.fertig ? '✓' : '○'}</span> {x.text}
                </li>
              ))}
            </ol>
            {hinweise.length > 0 && (
              <div className="tel-hinweise">
                {hinweise.map((h) => (
                  <span key={h} className="pille tel-hinweis">
                    {h}
                  </span>
                ))}
              </div>
            )}
            <div className="tel-reiter" role="tablist">
              {REITER.map((r) => (
                <button key={r.id} role="tab" aria-selected={reiter === r.id} className={reiter === r.id ? 'aktiv' : ''} onClick={() => setReiter(r.id)}>
                  {r.text}
                  {r.id === 'akte' && m.papiere?.length ? ` (${m.papiere.length})` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="modal-inhalt" onTouchStart={wischStart} onTouchEnd={wischEnde}>
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
            <div className="modal-block tel-b-fall tel-b-daten">
              {m.art === 'sterbefall' ? (
                <>
                  {zeile('Geboren', m.geburtsdatum?.split('-').reverse().join('.'))}
                  {fehltFeld('Geburtsdatum fehlt', 'geburtsdatum', 'date')}
                  {zeile('Verstorben in', [ort ? `${ort.symbol} ${ort.label}` : '', m.ort, m.ortNotiz].filter(Boolean).join(' – '))}
                  {zeile('Hausarzt', m.hausarzt)}
                  {fehltFeld('Hausarzt fehlt', 'hausarzt', 'text')}
                  {m.polizei && zeile('Polizei', '🚓 Polizeieinsatz')}
                </>
              ) : (
                <>
                  {zeile('Anliegen', <span className="tel-umbruch">{m.anliegen}</span>)}
                  {(fall || m.fallName) && zeile('Sterbefall', `✝ ${fall ? titel(fall) : m.fallName}`)}
                </>
              )}
              {zeile('Anrufer', m.anrufer)}
              {zeile('Nummer', m.nummer && <a href={`tel:${m.nummer.replace(/[^\d+]/g, '')}`}>📞 {m.nummer}</a>)}
              {zeile('Notiz', m.notiz && <span className="tel-umbruch">{m.notiz}</span>)}
              {m.uebergabe && zeile('Übergeben', `${zeitText(m.uebergabe.am)}${m.uebergabe.an.length ? ` an ${personText(m.uebergabe.an)}` : ''}`)}
              {m.abholung && zeile('Abgeholt', `${zeitText(m.abholung.am)} · ${m.abholung.kuehlraum ? `Kühlraum ${m.abholung.kuehlraum}` : '⚠ ohne Kühlraum'}${m.abholung.notiz ? ` · ${m.abholung.notiz}` : ''}`)}
              {m.geaendert && zeile('Geändert', zeitText(m.geaendert.am), true)}
              {verknuepft.length > 0 && zeile('Anliegen dazu', verknuepft.map((x) => `💬 ${titel(x)} (${zeitText(x.zeit)})`).join('\n'), true)}
              {cockpit && weiter('nav', '🧭 Weiter zur Navigation')}
            </div>
          )}

          {cockpit && (
            <div className="modal-block tel-b-cockpit">
              <div className={`tel-held ${m.abholung ? 'fertig' : ''}`}>
                <div className="tel-held-kopf">
                  <span className="tel-held-icon">{phase.icon}</span>
                  <span>
                    <b>{phase.text}</b>
                    <small>{phase.sub}</small>
                  </span>
                </div>
                {m.status === 'offen' && daten.darfTelefon ? (
                  <button className="knopf primaer" disabled={laeuft} onClick={() => void tun(() => mitschriftAktion(m.id, 'uebergeben'))}>
                    🚐 An Bereitschaft übergeben
                  </button>
                ) : istOffen(m) && daten.darfAbholen ? (
                  navZiel ? (
                    <button className="knopf primaer" onClick={() => setReiter('nav')}>
                      🧭 Losfahren
                    </button>
                  ) : (
                    <button className="knopf primaer" onClick={abholungStarten}>
                      ❄ Abholung abschließen
                    </button>
                  )
                ) : null}
              </div>
              <div className="tel-kacheln">
                {navZiel ? (
                  <button type="button" className="tel-kachel breit" onClick={() => setReiter('nav')}>
                    {kachel(ort?.symbol ?? '📍', ort?.label ?? 'Sterbeort', navZiel, m.ortNotiz && <small>{m.ortNotiz}</small>)}
                    <span className="tel-k-pfeil">›</span>
                  </button>
                ) : (
                  <div className="tel-kachel breit warn">{kachel('⚠', 'fehlt', 'Sterbeort – über „Mehr“ → Bearbeiten')}</div>
                )}
                {m.nummer ? (
                  <a className="tel-kachel" href={`tel:${m.nummer.replace(/[^\d+]/g, '')}`}>
                    {kachel('📞', 'Anrufer', m.anrufer || m.nummer)}
                  </a>
                ) : (
                  m.anrufer && <div className="tel-kachel">{kachel('👤', 'Anrufer', m.anrufer)}</div>
                )}
                {m.polizei && <div className="tel-kachel signal">{kachel('🚓', 'Achtung', 'Polizei')}</div>}
                {m.geburtsdatum && <div className="tel-kachel">{kachel('🎂', 'Geboren', m.geburtsdatum.split('-').reverse().join('.'))}</div>}
                {m.hausarzt && <div className="tel-kachel">{kachel('🩺', 'Hausarzt', m.hausarzt)}</div>}
                {(['hausarzt', 'geburtsdatum'] as const)
                  .filter((f) => !m[f])
                  .map((f) =>
                    nachtragOffen === f ? (
                      <div key={f} className="tel-kachel breit warn">
                        {fehltFeld(f === 'hausarzt' ? 'Hausarzt nachtragen' : 'Geburtsdatum nachtragen', f, f === 'hausarzt' ? 'text' : 'date')}
                      </div>
                    ) : (
                      <button key={f} type="button" className="tel-kachel warn" onClick={() => setNachtragOffen(f)}>
                        {kachel('⚠', 'fehlt – antippen', f === 'hausarzt' ? 'Hausarzt' : 'Geburtsdatum')}
                        <span className="tel-k-pfeil">＋</span>
                      </button>
                    ),
                  )}
                {m.notiz && <div className="tel-kachel breit notiz">{kachel('📝', 'Notiz', <span className="tel-umbruch">{m.notiz}</span>)}</div>}
              </div>
            </div>
          )}

          {cockpit && (
            <div className="modal-block tel-b-nav">
              {navZiel ? (
                <>
                  <div className="tel-nav-ziel">
                    <span className="klein">Ziel</span>
                    <b>
                      {ort?.symbol} {navZiel}
                    </b>
                    {m.ortNotiz && <span className="klein">{m.ortNotiz}</span>}
                  </div>
                  {karteAn ? (
                    <iframe
                      className="tel-navkarte"
                      title={`Karte: ${navZiel}`}
                      loading="lazy"
                      allow="geolocation"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={
                        typeof standort === 'object' && standort
                          ? `https://maps.google.com/maps?saddr=${standort.lat},${standort.lng}&daddr=${encodeURIComponent(navZiel)}&dirflg=d&output=embed`
                          : `https://maps.google.com/maps?q=${encodeURIComponent(navZiel)}&z=15&output=embed`
                      }
                    />
                  ) : (
                    <button type="button" className="knopf tel-navkarte tel-karte-laden" onClick={() => setKarteAn(true)}>
                      🗺 Karte anzeigen
                    </button>
                  )}
                  {standort === 'fehlt' && <p className="klein tel-nav-info">Standort nicht verfügbar – Standortfreigabe erlauben und erneut tippen.</p>}
                  <div className="tel-nav-knoepfe">
                    <button type="button" className="knopf primaer" disabled={standort === 'sucht'} onClick={() => { setKarteAn(true); routeHolen(); }}>
                      {standort === 'sucht' ? '📍 Standort wird gesucht …' : typeof standort === 'object' && standort ? '📍 Route aktualisieren' : '🧭 Route von hier'}
                    </button>
                    {m.nummer && (
                      <a className="knopf" href={`tel:${m.nummer.replace(/[^\d+]/g, '')}`}>
                        📞 {m.anrufer || 'Anrufer'}
                      </a>
                    )}
                  </div>
                  <a className="klein tel-nav-extern" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(navZiel)}&travelmode=driving`} target="_blank" rel="noreferrer">
                    Sprachnavigation in Google Maps ↗
                  </a>
                </>
              ) : (
                <p className="klein">Kein Sterbeort eingetragen – über „✎ Bearbeiten“ nachtragen.</p>
              )}
              {weiter('akte', '✓ Weiter zum Abschluss')}
            </div>
          )}

          <div className="modal-block tel-b-mitschnitt">
            <h4>🎙 Mitschnitt</h4>
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

          {m.art === 'sterbefall' && (
            <div className="modal-block tel-b-akte">
              <h4>📄 Sterbepapiere {m.papiere?.length ? `(${m.papiere.length})` : ''}</h4>
              {m.papiere?.length ? (
                <ul className="tel-papiere">
                  {m.papiere.map((p) => (
                    <li key={p.id}>
                      <button className="knopf klein" onClick={() => void papierDatei(m.id, p.id).then((b) => herunterladen(b, p.name), (e: Error) => setFehler(e.message))} title="Herunterladen">
                        ⬇ {p.name}
                      </button>
                      <span className="klein">
                        {Math.max(1, Math.round(p.groesse / 1024))} KB · {zeitText(p.am)}
                      </span>
                      {(daten.admin || p.von === daten.ich.email.toLowerCase()) && (
                        <button className="knopf klein gefahr" disabled={laeuft} onClick={() => confirm(`„${p.name}“ löschen?`) && void tun(() => papierEntfernen(m.id, p.id))}>
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="klein">Noch keine Papiere.</p>
              )}
              {(m.papiere?.length ?? 0) < PAPIER_MAX_ANZAHL && (
                <label className={`knopf ${laeuft ? 'deaktiviert' : ''}`}>
                  📎 Papiere hochladen<span className="tel-lang"> (Foto oder PDF, mehrere möglich)</span>
                  <input
                    type="file"
                    hidden
                    multiple
                    disabled={laeuft}
                    accept={BELEG_TYPEN.join(',')}
                    onChange={(ev) => {
                      const dateien = [...(ev.target.files ?? [])].slice(0, PAPIER_MAX_ANZAHL - (m.papiere?.length ?? 0));
                      ev.target.value = '';
                      if (!dateien.length) return;
                      void tun(async () => {
                        let d: TelefonDaten | null = null;
                        for (const f of dateien) {
                          const { datei, name } = await belegVorbereiten(f);
                          d = await papierHochladen(m.id, datei, name);
                          setDaten(d);
                        }
                        return d!;
                      });
                    }}
                  />
                </label>
              )}
            </div>
          )}

          {abholung && (
            <div className="modal-block ab-formular tel-b-abholung">
              <h4>Abholung abschließen</h4>
              <label className="ab-feld">
                Eingekühlt in (Kühlraum)
                <input className="feld" list="tel-kuehlraeume" value={abholung.kuehlraum} autoFocus placeholder="Kühlraum wählen oder eintippen" onChange={(e) => { setAbholung({ ...abholung, kuehlraum: e.target.value }); setFehlt(null); }} />
                <datalist id="tel-kuehlraeume">
                  {kuehlWahl.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </label>
              {kuehlWahl.length > 0 && (
                <div className="tel-kuehl-chips" role="group" aria-label="Kühlraum-Schnellauswahl">
                  {kuehlWahl.map((k) => (
                    <button key={k} type="button" className={`pille ${abholung.kuehlraum === k ? 'aktiv' : ''}`} onClick={() => { setAbholung({ ...abholung, kuehlraum: k }); setFehlt(null); }}>
                      ❄ {k}
                    </button>
                  ))}
                </div>
              )}
              {daten.admin && (kuehlListe === null ? (
                <button type="button" className="knopf klein-knopf" onClick={() => setKuehlListe((daten.kuehlraeumeFest ?? []).join('\n'))}>
                  ✎ Kühlräume anlegen
                </button>
              ) : (
                <div className="ab-feld">
                  <span className="klein">Angelegte Kühlräume, einer je Zeile</span>
                  <textarea className="feld" rows={4} value={kuehlListe} onChange={(e) => setKuehlListe(e.target.value)} />
                  <div className="ab-modal-knoepfe">
                    <button type="button" className="knopf" disabled={laeuft} onClick={() => void tun(() => kuehlraeumeFestlegen(kuehlListe.split('\n').map((x) => x.trim()).filter(Boolean)), () => setKuehlListe(null))}>
                      Liste speichern
                    </button>
                    <button type="button" className="knopf" onClick={() => setKuehlListe(null)}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              ))}
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
                  <input className="feld" value={abholung.hausarzt} onChange={(e) => { setAbholung({ ...abholung, hausarzt: e.target.value }); setFehlt(null); }} />
                </label>
              )}
              <textarea className="feld" rows={2} placeholder="Notiz zur Abholung (optional)" value={abholung.notiz} onChange={(e) => setAbholung({ ...abholung, notiz: e.target.value })} />
              {fehlt && (
                <div className="banner warnung">
                  ⚠ Noch nicht eingetragen: <b>{fehlt.join(' und ')}</b>. Bitte nachtragen – oder bewusst ohne abschließen.
                </div>
              )}
              <div className="ab-modal-knoepfe">
                {fehlt ? (
                  <button className="knopf warn-knopf" disabled={laeuft} onClick={() => void tun(() => mitschriftAktion(m.id, 'abholung', { ...abholung, ueberspringen: true }), () => { setAbholung(null); setFehlt(null); })}>
                    ⚠ Trotzdem abschließen
                  </button>
                ) : (
                  <button
                    className="knopf primaer"
                    disabled={laeuft}
                    onClick={() => {
                      const offen = [...(abholung.kuehlraum.trim() ? [] : ['Kühlraum']), ...(m.hausarzt || abholung.hausarzt.trim() ? [] : ['Hausarzt'])];
                      if (offen.length) setFehlt(offen);
                      else void tun(() => mitschriftAktion(m.id, 'abholung', abholung), () => setAbholung(null));
                    }}
                  >
                    ✓ Abholung abgeschlossen
                  </button>
                )}
                <button className="knopf" onClick={() => { setAbholung(null); setFehlt(null); }}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {fehler && <div className="banner fehler tel-b-voll">{fehler}</div>}
          {cockpit && !abholung && naechster && (
            <div className={`tel-naechster ${m.abholung ? 'fertig' : ''}`}>
              <span className="klein">Nächster Schritt</span>
              <b>{naechster}</b>
            </div>
          )}
          {!bearbeiten && !abholung && (
            <div className="ab-modal-knoepfe tel-aktionen">
              {m.art === 'sterbefall' && m.status === 'offen' && daten.darfTelefon && (
                <button className="knopf primaer" disabled={laeuft} onClick={() => void tun(() => mitschriftAktion(m.id, 'uebergeben'))} title={`Bereitschaft jetzt: ${personText(daten.bereitschaft) || 'niemand eingeteilt'}`}>
                  🚐 An Bereitschaft übergeben
                </button>
              )}
              {m.art === 'sterbefall' && istOffen(m) && daten.darfAbholen && (
                <button className={`knopf ${m.status === 'uebergeben' ? 'primaer' : ''}`} onClick={abholungStarten}>
                  ❄ Abholung abschließen
                </button>
              )}
              {m.art === 'anliegen' && daten.darfTelefon && (
                <button className={`knopf ${m.status === 'offen' ? 'primaer' : ''}`} disabled={laeuft} onClick={() => void tun(() => mitschriftAktion(m.id, 'erledigt'))}>
                  {m.status === 'erledigt' ? '↺ Wieder offen' : '✓ Erledigt'}
                </button>
              )}
              {cockpit && (
                <button type="button" className="knopf tel-mehr-knopf" aria-expanded={mehr} onClick={() => setMehr(!mehr)}>
                  {mehr ? '✕ Weniger' : '⋯ Mehr'}
                </button>
              )}
              <button className="knopf tel-zweit" onClick={() => void teilen()}>
                ↗ Teilen
              </button>
              {(daten.darfTelefon || (daten.darfAbholen && m.art === 'sterbefall')) && (
                <button className="knopf tel-zweit" disabled={laeuft} onClick={() => setBearbeiten(ausMitschrift(m))}>
                  ✎ Bearbeiten
                </button>
              )}
              {daten.admin && (
                <button className="knopf gefahr tel-zweit" disabled={laeuft} onClick={() => confirm('Mitschrift endgültig löschen?') && void tun(() => mitschriftEntfernen(m.id), schliessen)}>
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
