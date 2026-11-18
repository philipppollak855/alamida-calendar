import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { KATEGORIEN, notizAus, type Kategorie, type Termin } from './planungLogic';
import { terminAendern, terminAnlegen } from './api';
import { checklisteAus, sichtAus, type Wiederholung } from '../shared/neuerTermin';

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const ARTEN: [Wiederholung['art'], string, string][] = [
  ['taeglich', 'täglich', 'Tage'],
  ['woechentlich', 'wöchentlich', 'Wochen'],
  ['monatlich', 'monatlich', 'Monate'],
];

const AUSWAHL: Kategorie[] = ['Ueberfuehrung', 'Abholung', 'Kremation', 'Rosenkranz', 'Trauerfeier', 'Beisetzung', 'Trauergespraech', 'Vorsorge', 'Sonstiges'];

/** Neuer Termin per Klick auf einen Tag (nur mit Recht „Termine anlegen“). */
export default function NeuerTerminDialog({
  datum,
  zeit,
  dauer,
  vorlage,
  auswahl,
  onAngelegt,
  onSchliessen,
}: {
  vorlage?: Termin;
  auswahl?: { gruppen?: { id: string; name: string }[]; personen?: { email: string; name: string }[] };
  datum: string;
  zeit?: string;
  dauer: Record<string, number>;
  /** neuLaden: Serie angelegt bzw. ganze Serie geändert – Termine neu holen. */
  onAngelegt: (t: Termin, neuLaden?: boolean) => void;
  onSchliessen: () => void;
}) {
  const [kategorie, setKategorie] = useState<Kategorie>(vorlage?.kategorie ?? 'Trauergespraech');
  const [titel, setTitel] = useState(vorlage?.titel ?? '');
  const [tag, setTag] = useState(vorlage ? format(vorlage.start, 'yyyy-MM-dd') : datum);
  const [ganztaegig, setGanztaegig] = useState(vorlage?.ganztaegig ?? false);
  const [uhr, setUhr] = useState(vorlage && !vorlage.ganztaegig ? format(vorlage.start, 'HH:mm') : zeit && zeit !== '00:00' ? zeit : '09:00');
  const [minuten, setMinuten] = useState(
    vorlage && !vorlage.ganztaegig ? Math.max(5, Math.round((vorlage.ende.getTime() - vorlage.start.getTime()) / 60000)) : (dauer[vorlage?.kategorie ?? 'Trauergespraech'] ?? 60),
  );
  const [ort, setOrt] = useState(vorlage?.ort ?? '');
  const [notiz, setNotiz] = useState(vorlage ? notizAus(vorlage.beschreibung) : '');
  const [wArt, setWArt] = useState<Wiederholung['art'] | ''>('');
  const [alle, setAlle] = useState(1);
  const [wTage, setWTage] = useState<number[]>([]);
  const [bis, setBis] = useState('');
  const [punkte, setPunkte] = useState(checklisteAus(vorlage?.details).join('\n'));
  const [sichtG, setSichtG] = useState<string[]>(sichtAus(vorlage?.details).gruppen);
  const [sichtP, setSichtP] = useState<string[]>(sichtAus(vorlage?.details).personen);
  const [ganzeSerie, setGanzeSerie] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onSchliessen();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSchliessen]);

  const k = KATEGORIEN[kategorie];
  const wochentag = (new Date(`${tag}T12:00`).getDay() + 6) % 7;
  const umschalten = (l: string[], x: string) => (l.includes(x) ? l.filter((y) => y !== x) : [...l, x]);
  const gruppen = auswahl?.gruppen ?? [];
  const personen = auswahl?.personen ?? [];
  const sichtText =
    sichtG.length || sichtP.length
      ? [...sichtG.map((g) => gruppen.find((x) => x.id === g)?.name ?? g), ...sichtP.map((p) => personen.find((x) => x.email === p)?.name ?? p)].join(', ')
      : 'alle';
  const wText = wArt ? `${alle > 1 ? `alle ${alle} ${ARTEN.find((a) => a[0] === wArt)?.[2]}` : ARTEN.find((a) => a[0] === wArt)?.[1]}${bis ? ` bis ${bis.split('-').reverse().join('.')}` : ''}` : 'nein';
  const anzahlPunkte = punkte.split('\n').filter((x) => x.trim()).length;
  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    setFehler(null);
    try {
      const wiederholung: Wiederholung | undefined = !vorlage && wArt ? { art: wArt, alle, ...(wArt === 'woechentlich' ? { tage: wTage.length ? wTage : [wochentag] } : {}), ...(bis ? { bis } : {}) } : undefined;
      const daten = {
        kategorie,
        titel,
        datum: tag,
        ...(ganztaegig ? {} : { zeit: uhr }),
        dauer: minuten,
        ort,
        notiz,
        ...(wiederholung ? { wiederholung } : {}),
        checkliste: punkte.split('\n').map((x) => x.trim()).filter(Boolean),
        sichtGruppen: sichtG,
        sichtPersonen: sichtP,
      };
      const serie = !!vorlage?.serie && ganzeSerie;
      onAngelegt(await (vorlage ? terminAendern(vorlage.id, daten, serie) : terminAnlegen(daten)), !!wiederholung || serie);
    } catch (x) {
      setFehler((x as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <form className="modal neu-termin" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void speichern(e)}>
        <header className="modal-kopf" style={{ background: k.farbe }}>
          <div>
            <div className="modal-kategorie">{vorlage ? 'Termin bearbeiten' : 'Neuer Termin'}</div>
            <h2>{format(new Date(`${tag}T00:00`), 'EEEE, d. MMMM yyyy', { locale: de })}</h2>
          </div>
          <button type="button" className="modal-zu" onClick={onSchliessen} aria-label="Schließen">
            ✕
          </button>
        </header>
        <div className="modal-inhalt">
          <div className="neu-kategorien">
            {AUSWAHL.map((x) => (
              <button
                key={x}
                type="button"
                className={`neu-kategorie ${x === kategorie ? 'an' : ''}`}
                style={{ ['--kat' as string]: KATEGORIEN[x].farbe }}
                onClick={() => {
                  setKategorie(x);
                  if (!vorlage) setMinuten(dauer[x] ?? 60);
                }}
              >
                <span>{KATEGORIEN[x].symbol}</span> {KATEGORIEN[x].label}
              </button>
            ))}
          </div>
          <label className="neu-feld">
            <span>{['Sonstiges'].includes(kategorie) ? 'Titel' : 'Name / Titel'}</span>
            <input className="feld" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Maria Huber" autoFocus required maxLength={150} />
          </label>
          <div className="neu-zeile">
            <label className="neu-feld">
              <span>Datum</span>
              <input className="feld" type="date" value={tag} onChange={(e) => e.target.value && setTag(e.target.value)} required />
            </label>
            {!ganztaegig && (
              <>
                <label className="neu-feld">
                  <span>Uhrzeit</span>
                  <input className="feld" type="time" value={uhr} onChange={(e) => setUhr(e.target.value)} required />
                </label>
                <label className="neu-feld">
                  <span>Dauer (Min.)</span>
                  <input className="feld" type="number" min={5} max={1440} step={5} value={minuten} onChange={(e) => setMinuten(Number(e.target.value))} required />
                </label>
              </>
            )}
          </div>
          <label className="neu-check">
            <input type="checkbox" checked={ganztaegig} onChange={(e) => setGanztaegig(e.target.checked)} /> ganztägig
          </label>
          <label className="neu-feld">
            <span>Ort</span>
            <input className="feld" value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="optional" maxLength={200} />
          </label>
          <label className="neu-feld">
            <span>Notiz</span>
            <textarea className="feld" value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={3} placeholder="optional" maxLength={2000} />
          </label>
          {!vorlage && (
            <details className="neu-mehr">
              <summary>🔁 Wiederholen: {wText}</summary>
              <div className="neu-zeile">
                <label className="neu-feld">
                  <span>Muster</span>
                  <select className="feld" value={wArt} onChange={(e) => setWArt(e.target.value as Wiederholung['art'] | '')}>
                    <option value="">nicht wiederholen</option>
                    {ARTEN.map(([a, l]) => (
                      <option key={a} value={a}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                {wArt && (
                  <>
                    <label className="neu-feld">
                      <span>alle … {ARTEN.find((a) => a[0] === wArt)?.[2]}</span>
                      <input className="feld" type="number" min={1} max={99} value={alle} onChange={(e) => setAlle(Math.max(1, Number(e.target.value) || 1))} />
                    </label>
                    <label className="neu-feld">
                      <span>bis (leer = ohne Ende)</span>
                      <input className="feld" type="date" min={tag} value={bis} onChange={(e) => setBis(e.target.value)} />
                    </label>
                  </>
                )}
              </div>
              {wArt === 'woechentlich' && (
                <div className="neu-chips">
                  {WOCHENTAGE.map((w, i) => {
                    const an = wTage.length ? wTage.includes(i) : i === wochentag;
                    return (
                      <button key={w} type="button" className={`neu-chip ${an ? 'an' : ''}`} onClick={() => setWTage((l) => { const basis = l.length ? l : [wochentag]; return basis.includes(i) ? basis.filter((x) => x !== i) : [...basis, i]; })}>
                        {w}
                      </button>
                    );
                  })}
                </div>
              )}
            </details>
          )}
          <details className="neu-mehr" open={anzahlPunkte > 0}>
            <summary>☑ Checkliste{anzahlPunkte ? ` (${anzahlPunkte} Punkte)` : ''}</summary>
            <textarea className="feld" value={punkte} onChange={(e) => setPunkte(e.target.value)} rows={4} placeholder={'Ein Punkt pro Zeile, z. B.\nBöden wischen\nMüll entleeren'} />
          </details>
          {(gruppen.length > 0 || personen.length > 0) && (
            <details className="neu-mehr" open={sichtG.length + sichtP.length > 0}>
              <summary>👁 Sichtbar für: {sichtText}</summary>
              <p className="klein">Nichts gewählt = alle mit Zugriff auf die Kategorie. Mehrfachauswahl möglich, du und Admins sehen den Termin immer.</p>
              {gruppen.length > 0 && (
                <div className="neu-chips">
                  {gruppen.map((g) => (
                    <button key={g.id} type="button" className={`neu-chip ${sichtG.includes(g.id) ? 'an' : ''}`} onClick={() => setSichtG((l) => umschalten(l, g.id))}>
                      👥 {g.name}
                    </button>
                  ))}
                </div>
              )}
              {personen.length > 0 && (
                <div className="neu-chips">
                  {personen.map((p) => (
                    <button key={p.email} type="button" className={`neu-chip ${sichtP.includes(p.email) ? 'an' : ''}`} onClick={() => setSichtP((l) => umschalten(l, p.email))}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </details>
          )}
          {vorlage?.serie && (
            <label className="neu-check">
              <input type="checkbox" checked={ganzeSerie} onChange={(e) => setGanzeSerie(e.target.checked)} /> Für alle Termine der Serie übernehmen (Titel, Ort, Notiz, Checkliste, Sichtbarkeit; Datum/Uhrzeit bleiben)
            </label>
          )}
          {fehler && <div className="warnung">{fehler}</div>}
          <div className="aktionen">
            <button className="knopf primaer" type="submit" disabled={laeuft}>
              {laeuft ? 'Speichert …' : vorlage ? 'Speichern' : 'Termin anlegen'}
            </button>
            <button className="knopf" type="button" onClick={onSchliessen}>
              Abbrechen
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
