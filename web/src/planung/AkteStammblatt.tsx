import { useState, type ReactNode } from 'react';
import { BEREICHE, NACHWEIS_VORSCHLAEGE, VERTRAEGE, akteWarnungen, type AkteDaten, type Bereich, type Personal, type Vertrag } from '../shared/abwesenheit';
import { datumText } from '../shared/bereitschaft';
import { personAendern, type AbwesenheitDaten } from './api';

const tt = (d?: string) => (d ? d.split('-').reverse().join('.') : '');
const alter = (geb: string, heute: string) => {
  const j = Number(heute.slice(0, 4)) - Number(geb.slice(0, 4));
  return heute.slice(5) < geb.slice(5) ? j - 1 : j;
};
const telLink = (t?: string) => (t ? <a href={`tel:${t.replace(/[^\d+]/g, '')}`}>📞 {t}</a> : undefined);

function Karte({ titel, zeilen, kinder }: { titel: string; zeilen?: [string, ReactNode][]; kinder?: ReactNode }) {
  const da = (zeilen ?? []).filter(([, v]) => v);
  if (!da.length && !kinder) return null;
  return (
    <div className="akte-karte">
      <h4>{titel}</h4>
      {da.length > 0 && (
        <dl>
          {da.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {kinder}
    </div>
  );
}

/** Ablaufende Nachweise, Probezeit und Befristung aller Mitarbeiter (für Verwalter). */
export function AkteHinweise({ d, onOeffnen }: { d: AbwesenheitDaten; onOeffnen: (p: Personal) => void }) {
  const heute = datumText(new Date());
  const l = d.personal.flatMap((p) => akteWarnungen(p, heute).map((w) => ({ p, w })));
  if (!l.length) return null;
  return (
    <div className="akte-warn">
      {l.slice(0, 12).map(({ p, w }, i) => (
        <button key={i} type="button" className={w.tage < 0 ? 'rot' : 'gelb'} onClick={() => onOeffnen(p)}>
          ⚠ {p.name}: {w.text}
        </button>
      ))}
    </div>
  );
}

/** Erweiterte Personalakte für Büro, Außenteam und Facility. */
export function AkteStammblatt({ p, darf, onDaten }: { p: Personal; darf: boolean; onDaten: (x: AbwesenheitDaten) => void }) {
  const [x, setX] = useState<AkteDaten | null>(null);
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const heute = datumText(new Date());
  const a = p.akte ?? {};
  const warn = akteWarnungen(p, heute);

  if (x) {
    const feld = (k: keyof AkteDaten, label: string, typ = 'text', extra: Record<string, unknown> = {}) => (
      <label>
        {label}
        <input className="feld" type={typ} value={(x[k] as string | undefined) ?? ''} onChange={(e) => setX({ ...x, [k]: e.target.value || undefined })} {...extra} />
      </label>
    );
    const nachweise = x.nachweise ?? [];
    const setN = (l: typeof nachweise) => setX({ ...x, nachweise: l });
    const speichern = () => {
      setLaeuft(true);
      setFehler('');
      personAendern(p.email, { akte: { ...x, nachweise: nachweise.filter((n) => n.art.trim()) } })
        .then((neu) => {
          onDaten(neu);
          setX(null);
        })
        .catch((e: Error) => setFehler(e.message))
        .finally(() => setLaeuft(false));
    };
    return (
      <section className="glas admin-block ab-formular akte-form">
        <h3>Personalakte bearbeiten</h3>
        <h4>Beschäftigung</h4>
        <div className="neu-chips">
          {(Object.keys(BEREICHE) as Bereich[]).map((b) => {
            const an = x.bereiche?.includes(b);
            return (
              <button key={b} type="button" className={`neu-chip ${an ? 'an' : ''}`} onClick={() => setX({ ...x, bereiche: an ? x.bereiche!.filter((y) => y !== b) : [...(x.bereiche ?? []), b] })}>
                {BEREICHE[b]}
              </button>
            );
          })}
        </div>
        <div className="formular-reihe">
          {feld('funktion', 'Funktion', 'text', { placeholder: 'z. B. Bestatter, Träger, Fahrer, Reinigung' })}
          <label>
            Vertrag
            <select className="feld" value={x.vertrag ?? ''} onChange={(e) => setX({ ...x, vertrag: (e.target.value || undefined) as Vertrag | undefined })}>
              <option value="">–</option>
              {(Object.keys(VERTRAEGE) as Vertrag[]).map((v) => (
                <option key={v} value={v}>
                  {VERTRAEGE[v]}
                </option>
              ))}
            </select>
          </label>
          {feld('probezeitBis', 'Probezeit bis', 'date')}
          {feld('befristetBis', 'Befristet bis', 'date')}
        </div>
        <h4>Persönlich & Kontakt</h4>
        <div className="formular-reihe">
          {feld('geburtsdatum', 'Geburtsdatum', 'date')}
          {feld('adresse', 'Adresse')}
          {feld('telefonPrivat', 'Telefon privat', 'tel', { inputMode: 'tel' })}
          {feld('emailPrivat', 'E-Mail privat', 'email')}
        </div>
        <div className="formular-reihe">
          {feld('notfallName', 'Notfallkontakt (Name, Beziehung)')}
          {feld('notfallTelefon', 'Notfallkontakt Telefon', 'tel', { inputMode: 'tel' })}
          {feld('fuehrerschein', 'Führerscheinklassen', 'text', { placeholder: 'z. B. B, C1' })}
        </div>
        <h4>Nachweise, Schulungen, Impfungen</h4>
        <datalist id="akte-nachweise">
          {NACHWEIS_VORSCHLAEGE.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {nachweise.map((n, i) => (
          <div key={i} className="akte-nachweis-zeile">
            <input className="feld" list="akte-nachweise" placeholder="Art" value={n.art} onChange={(e) => setN(nachweise.map((y, j) => (j === i ? { ...y, art: e.target.value } : y)))} />
            <input className="feld" type="date" title="gültig bis" value={n.bis ?? ''} onChange={(e) => setN(nachweise.map((y, j) => (j === i ? { ...y, bis: e.target.value || undefined } : y)))} />
            <input className="feld" placeholder="Notiz" value={n.notiz ?? ''} onChange={(e) => setN(nachweise.map((y, j) => (j === i ? { ...y, notiz: e.target.value || undefined } : y)))} />
            <button type="button" className="knopf klein" aria-label="Entfernen" onClick={() => setN(nachweise.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="knopf klein" onClick={() => setN([...nachweise, { art: '' }])}>
          ＋ Nachweis
        </button>
        <h4>Kleidung & Ausrüstung</h4>
        <div className="formular-reihe">{feld('groessen', 'Größen Dienstkleidung', 'text', { placeholder: 'Sakko 52, Hemd 41, Hose 50, Schuhe 43' })}</div>
        <label>
          Ausgegeben (Schlüssel, Karten, Diensthandy, Dienstwagen …)
          <textarea className="feld" rows={2} value={x.ausruestung ?? ''} onChange={(e) => setX({ ...x, ausruestung: e.target.value || undefined })} />
        </label>
        <label>
          Notizen
          <textarea className="feld" rows={3} value={x.notiz ?? ''} onChange={(e) => setX({ ...x, notiz: e.target.value || undefined })} />
        </label>
        {fehler && <div className="banner fehler">{fehler}</div>}
        <div className="ab-modal-knoepfe">
          <button type="button" className="knopf primaer" disabled={laeuft} onClick={speichern}>
            {laeuft ? 'Speichert …' : 'Speichern'}
          </button>
          <button type="button" className="knopf" onClick={() => setX(null)}>
            Abbrechen
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="akte-blatt">
      <div className="akte-kopf">
        <h3>Personalakte</h3>
        {darf && (
          <button type="button" className="knopf klein" onClick={() => setX({ ...a, nachweise: [...(a.nachweise ?? [])] })}>
            ✎ Akte bearbeiten
          </button>
        )}
      </div>
      {warn.length > 0 && (
        <div className="akte-warn">
          {warn.map((w, i) => (
            <span key={i} className={w.tage < 0 ? 'rot' : 'gelb'}>
              ⚠ {w.text}
            </span>
          ))}
        </div>
      )}
      {!p.akte ? (
        <p className="klein">Noch keine Angaben{darf ? ' – über „✎ Akte bearbeiten“ ergänzen.' : '.'}</p>
      ) : (
        <div className="akte-raster">
          <Karte
            titel="Beschäftigung"
            zeilen={[
              ['Bereich', a.bereiche?.map((b) => BEREICHE[b]).join(' · ')],
              ['Funktion', a.funktion],
              ['Vertrag', a.vertrag && VERTRAEGE[a.vertrag]],
              ['Probezeit bis', tt(a.probezeitBis)],
              ['Befristet bis', tt(a.befristetBis)],
            ]}
          />
          <Karte
            titel="Persönlich & Kontakt"
            zeilen={[
              ['Geburtsdatum', a.geburtsdatum && `${tt(a.geburtsdatum)} (${alter(a.geburtsdatum, heute)} J.)`],
              ['Adresse', a.adresse],
              ['Telefon privat', telLink(a.telefonPrivat)],
              ['E-Mail privat', a.emailPrivat && <a href={`mailto:${a.emailPrivat}`}>{a.emailPrivat}</a>],
              ['Führerschein', a.fuehrerschein],
            ]}
          />
          <Karte titel="Notfallkontakt" zeilen={[['Name', a.notfallName], ['Telefon', telLink(a.notfallTelefon)]]} />
          <Karte
            titel="Nachweise & Schulungen"
            kinder={
              a.nachweise?.length ? (
                <ul className="akte-nachweise">
                  {a.nachweise.map((n, i) => {
                    const st = n.bis ? (n.bis < heute ? 'rot' : warn.some((w) => w.text.startsWith(n.art)) ? 'gelb' : 'ok') : '';
                    return (
                      <li key={i} className={st}>
                        <b>{n.art}</b>
                        {n.bis && <span> · bis {tt(n.bis)}</span>}
                        {n.notiz && <small> · {n.notiz}</small>}
                      </li>
                    );
                  })}
                </ul>
              ) : undefined
            }
          />
          <Karte titel="Kleidung & Ausrüstung" zeilen={[['Größen', a.groessen], ['Ausgegeben', a.ausruestung && <span className="akte-pre">{a.ausruestung}</span>]]} />
          <Karte titel="Notizen" zeilen={[['', a.notiz && <span className="akte-pre">{a.notiz}</span>]]} />
        </div>
      )}
    </section>
  );
}
