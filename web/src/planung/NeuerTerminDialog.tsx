import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { KATEGORIEN, notizAus, type Kategorie, type Termin } from './planungLogic';
import { terminAendern, terminAnlegen } from './api';

const AUSWAHL: Kategorie[] = ['Ueberfuehrung', 'Abholung', 'Kremation', 'Rosenkranz', 'Trauerfeier', 'Beisetzung', 'Trauergespraech', 'Vorsorge', 'Sonstiges'];

/** Neuer Termin per Klick auf einen Tag (nur mit Recht „Termine anlegen“). */
export default function NeuerTerminDialog({
  datum,
  zeit,
  dauer,
  vorlage,
  onAngelegt,
  onSchliessen,
}: {
  vorlage?: Termin;
  datum: string;
  zeit?: string;
  dauer: Record<string, number>;
  onAngelegt: (t: Termin) => void;
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
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onSchliessen();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSchliessen]);

  const k = KATEGORIEN[kategorie];
  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    setFehler(null);
    try {
      const daten = { kategorie, titel, datum: tag, ...(ganztaegig ? {} : { zeit: uhr }), dauer: minuten, ort, notiz };
      onAngelegt(await (vorlage ? terminAendern(vorlage.id, daten) : terminAnlegen(daten)));
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
