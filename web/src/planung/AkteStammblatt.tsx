import { useState, type ReactNode } from 'react';
import {
  AUSGABE_VORSCHLAEGE,
  BEREICHE,
  KLEIDUNG,
  NACHWEIS_VORSCHLAEGE,
  VERTRAEGE,
  akteWarnungen,
  ausgabeSymbol,
  type AkteDaten,
  type Ausgabe,
  type Bereich,
  type Nachweis,
  type Personal,
  type Vertrag,
} from '../shared/abwesenheit';
import { datumText } from '../shared/bereitschaft';
import { personAendern, type AbwesenheitDaten } from './api';

const tt = (d?: string) => (d ? d.split('-').reverse().join('.') : '');
const jahreSeit = (d: string, heute: string) => {
  const j = Number(heute.slice(0, 4)) - Number(d.slice(0, 4));
  return heute.slice(5) < d.slice(5) ? j - 1 : j;
};
const tel = (t?: string) => (t ? `tel:${t.replace(/[^\d+]/g, '')}` : '');
const telLink = (t?: string) => (t ? <a href={tel(t)}>{t}</a> : undefined);
const heuteText = () => datumText(new Date());

export function initialen(name: string) {
  const t = name.trim().split(/\s+/).filter(Boolean);
  return ((t[0]?.[0] ?? '?') + (t.length > 1 ? t[t.length - 1][0] : '')).toUpperCase();
}
const farbton = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

/** Ablaufende Nachweise, Probezeit und Befristung aller Mitarbeiter (für Verwalter). */
export function AkteHinweise({ d, onOeffnen }: { d: AbwesenheitDaten; onOeffnen: (p: Personal) => void }) {
  const heute = heuteText();
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

/** Kopf der Personalakte: Avatar, Eckdaten, Schnellaktionen. */
export function AkteKopf({ p, mail, schliessen }: { p: Personal; mail: boolean; schliessen: () => void }) {
  const a = p.akte ?? {};
  const heute = heuteText();
  const std = p.tage.reduce((x, y) => x + y, 0);
  const chips = [
    ...(a.bereiche ?? []).map((b) => BEREICHE[b]),
    a.funktion,
    p.gruppe,
    p.eintritt && `seit ${tt(p.eintritt)}${p.eintritt <= heute ? ` · ${jahreSeit(p.eintritt, heute)} J.` : ''}`,
    `${String(Math.round(std * 100) / 100).replace('.', ',')} h/Woche`,
    p.austritt && `Austritt ${tt(p.austritt)}`,
  ].filter(Boolean) as string[];
  return (
    <div className="akte-held" style={{ ['--akte-ton' as string]: String(farbton(p.name || p.email)) }}>
      <button className="modal-zu" onClick={schliessen} aria-label="Schließen">
        ✕
      </button>
      <div className="akte-avatar">{initialen(p.name || p.email)}</div>
      <div className="akte-held-text">
        <small>Personalakte</small>
        <h2>{p.name || p.email}</h2>
        <div className="akte-chips">
          {chips.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="akte-aktionen">
          {p.telefon && <a href={tel(p.telefon)}>📞 Dienst</a>}
          {a.telefonPrivat && <a href={tel(a.telefonPrivat)}>📱 Privat</a>}
          {mail && <a href={`mailto:${p.email}`}>✉ E-Mail</a>}
          {a.notfallTelefon && (
            <a className="notfall" href={tel(a.notfallTelefon)}>
              🆘 Notfall
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

interface Feld {
  label: string;
  typ?: 'text' | 'date' | 'tel' | 'email' | 'lang' | 'vertrag' | 'bereiche';
  hinweis?: string;
  get: (p: Personal) => string | undefined;
  set: (p: Personal, v: string | undefined) => Personal;
  zeige?: (p: Personal) => ReactNode;
}
const af = (k: keyof AkteDaten, label: string, typ: Feld['typ'] = 'text', zeige?: Feld['zeige'], hinweis?: string): Feld => ({
  label,
  typ,
  hinweis,
  zeige,
  get: (p) => p.akte?.[k] as string | undefined,
  set: (p, v) => ({ ...p, akte: { ...p.akte, [k]: v } }),
});

/** Speichert nur die geänderten Felder auf den frisch geladenen Stand, damit parallele Bearbeitungen erhalten bleiben. */
const speichern = (alt: Personal, neu: Personal, onDaten: (x: AbwesenheitDaten) => void) =>
  personAendern(alt.email, (frisch) => {
    const akte = { ...frisch.akte } as Record<string, unknown>;
    const a = (alt.akte ?? {}) as Record<string, unknown>;
    const n = (neu.akte ?? {}) as Record<string, unknown>;
    for (const k of new Set([...Object.keys(a), ...Object.keys(n)])) if (JSON.stringify(a[k]) !== JSON.stringify(n[k])) akte[k] = n[k];
    return { ...(alt.telefon !== neu.telefon ? { telefon: neu.telefon } : {}), akte: akte as AkteDaten };
  }).then(onDaten);

/** Kachel, die sich mit ✎ direkt an Ort und Stelle bearbeiten lässt. */
function EditKarte({
  icon,
  titel,
  felder,
  p,
  darf,
  onDaten,
  breit,
}: {
  icon: string;
  titel: string;
  felder: Feld[];
  p: Personal;
  darf: boolean;
  onDaten: (x: AbwesenheitDaten) => void;
  breit?: boolean;
}) {
  const [x, setX] = useState<Personal | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const sichtbar = x ? felder : felder.filter((f) => f.get(p));
  const wert = (f: Feld): ReactNode => {
    const v = f.get(p);
    if (!v) return null;
    if (f.zeige) return f.zeige(p);
    if (f.typ === 'date') return tt(v);
    if (f.typ === 'tel') return telLink(v);
    if (f.typ === 'email') return <a href={`mailto:${v}`}>{v}</a>;
    if (f.typ === 'vertrag') return VERTRAEGE[v as Vertrag] ?? v;
    if (f.typ === 'bereiche')
      return v
        .split(',')
        .map((b) => BEREICHE[b as Bereich] ?? b)
        .join(' · ');
    return <span className="akte-pre">{v}</span>;
  };
  const eingabe = (f: Feld) => {
    const v = f.get(x!) ?? '';
    const set = (n: string) => setX(f.set(x!, n.trim() ? n : undefined));
    if (f.typ === 'bereiche') {
      const an = v ? v.split(',') : [];
      return (
        <div className="akte-auswahl">
          {(Object.keys(BEREICHE) as Bereich[]).map((b) => (
            <button key={b} type="button" className={an.includes(b) ? 'an' : ''} onClick={() => set((an.includes(b) ? an.filter((y) => y !== b) : [...an, b]).join(','))}>
              {BEREICHE[b]}
            </button>
          ))}
        </div>
      );
    }
    if (f.typ === 'vertrag')
      return (
        <div className="akte-auswahl">
          {(Object.keys(VERTRAEGE) as Vertrag[]).map((k) => (
            <button key={k} type="button" className={v === k ? 'an' : ''} onClick={() => set(v === k ? '' : k)}>
              {VERTRAEGE[k]}
            </button>
          ))}
        </div>
      );
    if (f.typ === 'lang') return <textarea className="akte-inline" rows={3} value={v} placeholder={f.hinweis} onChange={(e) => set(e.target.value)} />;
    return (
      <input
        className="akte-inline"
        type={f.typ ?? 'text'}
        value={v}
        placeholder={f.hinweis}
        inputMode={f.typ === 'tel' ? 'tel' : undefined}
        onChange={(e) => set(e.target.value)}
      />
    );
  };
  return (
    <div className={`akte-karte ${breit ? 'breit' : ''} ${x ? 'edit' : ''}`}>
      <div className="akte-karte-kopf">
        <h4>
          <span>{icon}</span> {titel}
        </h4>
        {darf && !x && (
          <button type="button" className="akte-stift" aria-label={`${titel} bearbeiten`} onClick={() => setX(p)}>
            ✎
          </button>
        )}
      </div>
      {sichtbar.length ? (
        <dl>
          {sichtbar.map((f) => (
            <div key={f.label} className={f.typ === 'lang' || f.typ === 'bereiche' || f.typ === 'vertrag' ? 'voll' : ''}>
              <dt>{f.label}</dt>
              <dd>{x ? eingabe(f) : wert(f)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="akte-leer">{darf ? 'Noch leer – ✎ zum Ergänzen' : 'Keine Angaben'}</p>
      )}
      {x && (
        <div className="akte-karte-fuss">
          {fehler && <span className="akte-fehler">{fehler}</span>}
          <button type="button" className="knopf klein" onClick={() => (setX(null), setFehler(''))}>
            Abbrechen
          </button>
          <button
            type="button"
            className="knopf klein primaer"
            disabled={laeuft}
            onClick={() => {
              setLaeuft(true);
              setFehler('');
              speichern(p, x, onDaten)
                .then(() => setX(null))
                .catch((e: Error) => setFehler(e.message))
                .finally(() => setLaeuft(false));
            }}
          >
            {laeuft ? '…' : '✓ Speichern'}
          </button>
        </div>
      )}
    </div>
  );
}

function NachweisKarte({ p, darf, onDaten }: { p: Personal; darf: boolean; onDaten: (x: AbwesenheitDaten) => void }) {
  const [l, setL] = useState<Nachweis[] | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const heute = heuteText();
  const in60 = datumText(new Date(Date.now() + 60 * 86_400_000));
  const liste = [...(p.akte?.nachweise ?? [])].sort((a, b) => (a.bis ?? '9999').localeCompare(b.bis ?? '9999'));
  const status = (n: Nachweis) =>
    !n.bis ? ['', 'unbefristet'] : n.bis < heute ? ['rot', `abgelaufen ${tt(n.bis)}`] : n.bis <= in60 ? ['gelb', `bis ${tt(n.bis)}`] : ['ok', `bis ${tt(n.bis)}`];
  const setN = (i: number, n: Partial<Nachweis>) => setL(l!.map((y, j) => (j === i ? { ...y, ...n } : y)));
  return (
    <div className="akte-karte breit">
      <div className="akte-karte-kopf">
        <h4>
          <span>🎓</span> Nachweise, Schulungen, Impfungen
        </h4>
        {darf && !l && (
          <button type="button" className="akte-stift" aria-label="Nachweise bearbeiten" onClick={() => setL(liste.length ? liste : [{ art: '' }])}>
            ✎
          </button>
        )}
      </div>
      {!l ? (
        liste.length ? (
          <div className="akte-nachweise">
            {liste.map((n, i) => {
              const [k, t] = status(n);
              return (
                <div key={i} className={`akte-nachweis ${k}`}>
                  <b>{n.art}</b>
                  <span className="akte-pill">{t}</span>
                  {n.notiz && <small>{n.notiz}</small>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="akte-leer">{darf ? 'Noch keine – ✎ zum Ergänzen' : 'Keine Angaben'}</p>
        )
      ) : (
        <>
          <datalist id="akte-nachweise">
            {NACHWEIS_VORSCHLAEGE.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <div className="akte-nachweise">
            {l.map((n, i) => (
              <div key={i} className="akte-nachweis edit">
                <input className="akte-inline" list="akte-nachweise" placeholder="Art, z. B. Erste Hilfe" value={n.art} onChange={(e) => setN(i, { art: e.target.value })} />
                <label className="akte-bis">
                  gültig bis
                  <input className="akte-inline" type="date" value={n.bis ?? ''} onChange={(e) => setN(i, { bis: e.target.value || undefined })} />
                </label>
                <input className="akte-inline" placeholder="Notiz" value={n.notiz ?? ''} onChange={(e) => setN(i, { notiz: e.target.value || undefined })} />
                <button type="button" className="akte-stift" aria-label="Entfernen" onClick={() => setL(l.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="akte-auswahl">
            {NACHWEIS_VORSCHLAEGE.filter((v) => !l.some((n) => n.art === v))
              .slice(0, 8)
              .map((v) => (
                <button key={v} type="button" onClick={() => setL([...l.filter((n) => n.art.trim()), { art: v }])}>
                  ＋ {v}
                </button>
              ))}
            <button type="button" onClick={() => setL([...l, { art: '' }])}>
              ＋ Eigener
            </button>
          </div>
          <div className="akte-karte-fuss">
            {fehler && <span className="akte-fehler">{fehler}</span>}
            <button type="button" className="knopf klein" onClick={() => (setL(null), setFehler(''))}>
              Abbrechen
            </button>
            <button
              type="button"
              className="knopf klein primaer"
              disabled={laeuft}
              onClick={() => {
                setLaeuft(true);
                setFehler('');
                speichern(
                  p,
                  {
                    ...p,
                    akte: {
                      ...p.akte,
                      nachweise: l.filter((n) => n.art.trim()),
                    },
                  },
                  onDaten,
                )
                  .then(() => setL(null))
                  .catch((e: Error) => setFehler(e.message))
                  .finally(() => setLaeuft(false));
              }}
            >
              {laeuft ? '…' : '✓ Speichern'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export type AkteTab = 'uebersicht' | 'beschaeftigung' | 'kontakt' | 'nachweise' | 'ausruestung';

/** Inhalt der Akte-Reiter (ohne Zeitkonto/Abwesenheiten). */
export function AkteReiter({ tab, p, darf, onDaten, konto }: { tab: AkteTab; p: Personal; darf: boolean; onDaten: (x: AbwesenheitDaten) => void; konto?: ReactNode }) {
  const heute = heuteText();
  const a = p.akte ?? {};
  const k = { p, darf, onDaten };
  if (tab === 'uebersicht') {
    const warn = akteWarnungen(p, heute);
    const offen = (a.nachweise ?? []).filter((n) => n.bis && n.bis >= heute).sort((x, y) => x.bis!.localeCompare(y.bis!))[0];
    const kacheln: [string, string, string | undefined][] = [
      ['💼', 'Funktion', a.funktion],
      ['🏷', 'Bereich', a.bereiche?.map((b) => BEREICHE[b]).join(' · ')],
      ['📄', 'Vertrag', a.vertrag && VERTRAEGE[a.vertrag]],
      ['🎂', 'Alter', a.geburtsdatum && `${jahreSeit(a.geburtsdatum, heute)} Jahre`],
      ['🚗', 'Führerschein', a.fuehrerschein],
      ['🎓', 'Nächster Ablauf', offen && `${offen.art} · ${tt(offen.bis)}`],
    ];
    return (
      <div className="akte-tab">
        {warn.length > 0 && (
          <div className="akte-warn">
            {warn.map((w, i) => (
              <span key={i} className={w.tage < 0 ? 'rot' : 'gelb'}>
                ⚠ {w.text}
              </span>
            ))}
          </div>
        )}
        {konto}
        <div className="akte-blick">
          {kacheln
            .filter(([, , v]) => v)
            .map(([i, l, v]) => (
              <div key={l}>
                <span>{i}</span>
                <small>{l}</small>
                <b>{v}</b>
              </div>
            ))}
        </div>
        {a.notiz && (
          <div className="akte-karte breit">
            <div className="akte-karte-kopf">
              <h4>
                <span>🗒</span> Notizen
              </h4>
            </div>
            <p className="akte-pre">{a.notiz}</p>
          </div>
        )}
      </div>
    );
  }
  if (tab === 'beschaeftigung')
    return (
      <div className="akte-raster">
        <EditKarte
          icon="💼"
          titel="Anstellung"
          {...k}
          felder={[
            {
              ...af('bereiche', 'Bereich', 'bereiche'),
              get: (q) => q.akte?.bereiche?.join(','),
              set: (q, v) => ({
                ...q,
                akte: {
                  ...q.akte,
                  bereiche: v ? (v.split(',') as Bereich[]) : undefined,
                },
              }),
            },
            af('funktion', 'Funktion', 'text', undefined, 'z. B. Bestatter, Träger, Reinigung'),
            af('vertrag', 'Vertrag', 'vertrag'),
          ]}
        />
        <EditKarte icon="⏳" titel="Fristen" {...k} felder={[af('probezeitBis', 'Probezeit bis', 'date'), af('befristetBis', 'Befristet bis', 'date')]} />
        <div className="akte-karte">
          <div className="akte-karte-kopf">
            <h4>
              <span>📅</span> Dienstzeit & Urlaub
            </h4>
          </div>
          <dl>
            {(
              [
                ['Eintritt', tt(p.eintritt)],
                ['Austritt', tt(p.austritt)],
                [
                  'Wochentage',
                  p.tage
                    .map((h, i) => (h ? `${'MoDiMiDoFrSaSo'.slice(i * 2, i * 2 + 2)} ${String(h).replace('.', ',')}` : ''))
                    .filter(Boolean)
                    .join(' · '),
                ],
                ['Vordienstjahre', p.vordienstjahre ? String(p.vordienstjahre) : ''],
                ['Urlaubswochen', p.urlaubswochen ? String(p.urlaubswochen) : ''],
              ] as [string, string][]
            )
              .filter(([, v]) => v)
              .map(([l, v]) => (
                <div key={l}>
                  <dt>{l}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          {darf && <p className="akte-leer">Ändern im Reiter ⚙ Verwaltung</p>}
        </div>
      </div>
    );
  if (tab === 'kontakt')
    return (
      <div className="akte-raster">
        <EditKarte
          icon="☎"
          titel="Kontakt"
          {...k}
          felder={[
            {
              label: 'Diensttelefon',
              typ: 'tel',
              get: (q) => q.telefon,
              set: (q, v) => ({ ...q, telefon: v }),
            },
            af('telefonPrivat', 'Telefon privat', 'tel'),
            af('emailPrivat', 'E-Mail privat', 'email'),
            af('adresse', 'Adresse', 'text', (q) => (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q.akte?.adresse ?? '')}`} target="_blank" rel="noreferrer">
                {q.akte?.adresse}
              </a>
            )),
          ]}
        />
        <EditKarte icon="🆘" titel="Notfallkontakt" {...k} felder={[af('notfallName', 'Name', 'text', undefined, 'Name, Beziehung'), af('notfallTelefon', 'Telefon', 'tel')]} />
        <EditKarte
          icon="🎂"
          titel="Persönlich"
          {...k}
          felder={[af('geburtsdatum', 'Geburtsdatum', 'date', (q) => `${tt(q.akte?.geburtsdatum)} · ${jahreSeit(q.akte!.geburtsdatum!, heute)} J.`)]}
        />
      </div>
    );
  if (tab === 'nachweise')
    return (
      <div className="akte-raster">
        <EditKarte icon="🚗" titel="Führerschein" {...k} felder={[af('fuehrerschein', 'Klassen', 'text', undefined, 'z. B. B, C1')]} />
        <NachweisKarte {...k} />
      </div>
    );
  return (
    <div className="akte-raster">
      <AusgabeKarte {...k} />
      <KleidungKarte {...k} />
      {(a.groessen || a.ausruestung) && (
        <EditKarte
          icon="🗂"
          titel="Frühere Freitexte"
          {...k}
          felder={[af('groessen', 'Größen (alt)', 'lang'), af('ausruestung', 'Ausrüstung (alt)', 'lang')]}
        />
      )}
      <EditKarte icon="🗒" titel="Notizen" breit {...k} felder={[af('notiz', 'Notiz', 'lang')]} />
    </div>
  );
}

function KleidungKarte({ p, darf, onDaten }: { p: Personal; darf: boolean; onDaten: (x: AbwesenheitDaten) => void }) {
  const [x, setX] = useState<Record<string, string> | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const g = p.akte?.kleidung ?? {};
  const da = KLEIDUNG.filter(([key]) => (x ? true : g[key]));
  return (
    <div className={`akte-karte breit ${x ? 'edit' : ''}`}>
      <div className="akte-karte-kopf">
        <h4>
          <span>👔</span> Kleidergrößen
        </h4>
        {darf && !x && (
          <button type="button" className="akte-stift" aria-label="Kleidergrößen bearbeiten" onClick={() => setX({ ...g })}>
            ✎
          </button>
        )}
      </div>
      {da.length ? (
        <div className="akte-groessen">
          {da.map(([key, label]) => (
            <label key={key}>
              <small>{label}</small>
              {x ? <input className="akte-inline" value={x[key] ?? ''} placeholder="–" onChange={(e) => setX({ ...x, [key]: e.target.value })} /> : <b>{g[key]}</b>}
            </label>
          ))}
        </div>
      ) : (
        <p className="akte-leer">{darf ? 'Noch leer – ✎ zum Ergänzen' : 'Keine Angaben'}</p>
      )}
      {x && (
        <div className="akte-karte-fuss">
          {fehler && <span className="akte-fehler">{fehler}</span>}
          <button type="button" className="knopf klein" onClick={() => (setX(null), setFehler(''))}>
            Abbrechen
          </button>
          <button
            type="button"
            className="knopf klein primaer"
            disabled={laeuft}
            onClick={() => {
              const kleidung = Object.fromEntries(Object.entries(x).filter(([, v]) => v.trim()));
              setLaeuft(true);
              setFehler('');
              speichern(p, { ...p, akte: { ...p.akte, kleidung: Object.keys(kleidung).length ? kleidung : undefined } }, onDaten)
                .then(() => setX(null))
                .catch((e: Error) => setFehler(e.message))
                .finally(() => setLaeuft(false));
            }}
          >
            {laeuft ? '…' : '✓ Speichern'}
          </button>
        </div>
      )}
    </div>
  );
}

function AusgabeKarte({ p, darf, onDaten }: { p: Personal; darf: boolean; onDaten: (x: AbwesenheitDaten) => void }) {
  const [l, setL] = useState<Ausgabe[] | null>(null);
  const [zurueckAuch, setZurueckAuch] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const heute = heuteText();
  const alle = p.akte?.geraete ?? [];
  const aktiv = alle.filter((g) => !g.zurueck);
  const zurueck = alle.filter((g) => g.zurueck);
  const sichern = (neu: Ausgabe[], fertig?: () => void) => {
    setLaeuft(true);
    setFehler('');
    speichern(p, { ...p, akte: { ...p.akte, geraete: neu.filter((g) => g.art.trim()) } }, onDaten)
      .then(fertig)
      .catch((e: Error) => setFehler(e.message))
      .finally(() => setLaeuft(false));
  };
  const setG = (i: number, n: Partial<Ausgabe>) => setL(l!.map((y, j) => (j === i ? { ...y, ...n } : y)));
  const zeile = (g: Ausgabe) => (
    <div key={alle.indexOf(g)} className={`akte-ausgabe ${g.zurueck ? 'zurueck' : ''}`}>
      <span className="akte-ausgabe-symbol">{ausgabeSymbol(g.art)}</span>
      <div>
        <b>
          {g.art}
          {g.anzahl ? ` × ${g.anzahl}` : ''}
        </b>
        <small>{[g.nr && `Nr. ${g.nr}`, g.am && `seit ${tt(g.am)}`, g.zurueck && `zurück ${tt(g.zurueck)}`, g.notiz].filter(Boolean).join(' · ')}</small>
      </div>
      {darf && !g.zurueck && (
        <button type="button" className="knopf klein" disabled={laeuft} title="Als zurückgegeben markieren" onClick={() => sichern(alle.map((y) => (y === g ? { ...y, zurueck: heute } : y)))}>
          ↩ Zurück
        </button>
      )}
    </div>
  );
  return (
    <div className={`akte-karte breit ${l ? 'edit' : ''}`}>
      <div className="akte-karte-kopf">
        <h4>
          <span>🔑</span> Ausgegeben {aktiv.length > 0 && <em className="akte-zahl">{aktiv.length}</em>}
        </h4>
        {darf && !l && (
          <button type="button" className="akte-stift" aria-label="Ausgabeliste bearbeiten" onClick={() => setL(alle.length ? alle.map((g) => ({ ...g })) : [])}>
            ✎
          </button>
        )}
      </div>
      {!l ? (
        <>
          {aktiv.length ? <div className="akte-ausgaben">{aktiv.map(zeile)}</div> : <p className="akte-leer">{darf ? 'Nichts ausgegeben – ✎ zum Erfassen' : 'Nichts ausgegeben'}</p>}
          {zurueck.length > 0 && (
            <button type="button" className="akte-mehr" onClick={() => setZurueckAuch(!zurueckAuch)}>
              {zurueckAuch ? '▾' : '▸'} Zurückgegeben ({zurueck.length})
            </button>
          )}
          {zurueckAuch && <div className="akte-ausgaben">{zurueck.map(zeile)}</div>}
          {fehler && <span className="akte-fehler">{fehler}</span>}
        </>
      ) : (
        <>
          <datalist id="akte-ausgaben">
            {AUSGABE_VORSCHLAEGE.map(([, n]) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <div className="akte-ausgaben">
            {l.map((g, i) => (
              <div key={i} className="akte-ausgabe edit">
                <span className="akte-ausgabe-symbol">{ausgabeSymbol(g.art)}</span>
                <div className="akte-ausgabe-felder">
                  <input className="akte-inline" list="akte-ausgaben" placeholder="Gegenstand" value={g.art} onChange={(e) => setG(i, { art: e.target.value })} />
                  <label>
                    Anzahl
                    <input className="akte-inline" type="number" min={1} value={g.anzahl ?? 1} onChange={(e) => setG(i, { anzahl: Number(e.target.value) > 1 ? Number(e.target.value) : undefined })} />
                  </label>
                  <label>
                    Nr. / Kennz.
                    <input className="akte-inline" value={g.nr ?? ''} onChange={(e) => setG(i, { nr: e.target.value || undefined })} />
                  </label>
                  <label>
                    ausgegeben
                    <input className="akte-inline" type="date" value={g.am ?? ''} onChange={(e) => setG(i, { am: e.target.value || undefined })} />
                  </label>
                  <label>
                    zurück
                    <input className="akte-inline" type="date" value={g.zurueck ?? ''} onChange={(e) => setG(i, { zurueck: e.target.value || undefined })} />
                  </label>
                  <input className="akte-inline" placeholder="Notiz" value={g.notiz ?? ''} onChange={(e) => setG(i, { notiz: e.target.value || undefined })} />
                </div>
                <button type="button" className="akte-stift" aria-label="Entfernen" onClick={() => setL(l.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="akte-auswahl">
            {AUSGABE_VORSCHLAEGE.map(([sym, n]) => (
              <button key={n} type="button" onClick={() => setL([...l, { art: n, am: heute }])}>
                {sym} {n}
              </button>
            ))}
            <button type="button" onClick={() => setL([...l, { art: '', am: heute }])}>
              ＋ Eigener
            </button>
          </div>
          <div className="akte-karte-fuss">
            {fehler && <span className="akte-fehler">{fehler}</span>}
            <button type="button" className="knopf klein" onClick={() => (setL(null), setFehler(''))}>
              Abbrechen
            </button>
            <button type="button" className="knopf klein primaer" disabled={laeuft} onClick={() => sichern(l, () => setL(null))}>
              {laeuft ? '…' : '✓ Speichern'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
