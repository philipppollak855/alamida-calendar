import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Personal } from '../shared/abwesenheit';
import { stundenJeTag } from '../shared/abwesenheit';
import {
  berichtCsv,
  berichtHinweis,
  berichtNachtrag,
  berichtZeile,
  kalenderTage,
  monatPlus,
  monatsbericht,
  monatText,
  nachtragCsv,
  nachtragText,
  runden,
  type BerichtArchiv,
  type BerichtGruppen,
  type MonatsEintrag,
  type MonatsEntwurf,
  type NachtragZeile,
  type WertSchluessel,
  type ZeitkontoDaten,
  type ZeitkontoEinstellungen,
} from '../shared/zeitkonto';
import {
  berichtArchivEntfernen,
  berichtArchivieren,
  berichtArchivLaden,
  briefpapierEntfernen,
  briefpapierHochladen,
  zeitkontoEinstellungen,
  zeitkontoEntwurf,
  zeitkontoLaden,
  zeitkontoLoeschen,
  zeitkontoSpeichern,
  personalSpeichern,
  type AbwesenheitDaten,
} from './api';
import { drucken, herunterladen } from './beleg';
import { berichtPdf, nachtragPdf } from './zeitkontoPdf';

type Werte = Record<WertSchluessel, number>;
type Eingaben = Record<string, Partial<Record<WertSchluessel, string>>>;

const heuteMonat = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const zahl = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return isFinite(n) ? runden(n) : 0;
};
const text = (n: number) => String(n).replace('.', ',');
const uhrzeit = (t: number) => new Date(t).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
const standText = (t: number) => new Date(t).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
const VERSCHIEBUNG: [number, string][] = [
  [-1, 'Vormonat (−1)'],
  [0, 'Berichtsmonat (0)'],
  [1, 'Folgemonat (+1)'],
];
const AUTOSPEICHERN_MS = 1500;

const eingabenAus = (zk: ZeitkontoDaten, monat: string): Eingaben =>
  Object.fromEntries(
    (zk.entwuerfe ?? [])
      .filter((x) => x.monat === monat)
      .map((x) => [x.email, Object.fromEntries(Object.entries(x.werte).map(([k, v]) => [k, text(v)]))]),
  );

/** Enter springt ins nächste Zahlenfeld (Shift+Enter zurück). */
function weiter(ev: KeyboardEvent<HTMLInputElement>) {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  const felder = [...(ev.currentTarget.closest('.ab-zeitkonto')?.querySelectorAll<HTMLInputElement>('input.zk-zahl') ?? [])];
  const i = felder.indexOf(ev.currentTarget);
  felder[i + (ev.shiftKey ? -1 : 1)]?.focus();
}

/** Überstunden, Auszahlung, Saldo und Fehltage je Monat pflegen; Eingaben werden zwischengespeichert; Monatsbericht und Nachtrag (PDF, CSV). */
export default function ZeitkontoAnsicht({ d, onDaten }: { d: AbwesenheitDaten; onDaten?: (x: AbwesenheitDaten) => void }) {
  const [korr, setKorr] = useState<{ email: string; wert: string } | null>(null);
  const uebertragKorrigieren = (p: Personal, wert: string) => {
    const n = Number(wert.replace(',', '.'));
    if (!isFinite(n)) return setMeldung({ ok: false, text: 'Ungültige Zahl' });
    void personalSpeichern(d.personal.map((x) => (x.email === p.email ? { ...x, ueStartSaldo: n, ueAbMonat: monat } : x)))
      .then((neu) => {
        onDaten?.(neu);
        setKorr(null);
        setMeldung({ ok: true, text: `${p.name}: Ü-Übertrag ab ${monat} auf ${text(n)} h gesetzt` });
      })
      .catch((e: Error) => setMeldung({ ok: false, text: e.message }));
  };
  const [zk, setZk] = useState<ZeitkontoDaten | null>(null);
  const [monat, setMonat] = useState(() => monatPlus(heuteMonat(), -1));
  const [entwurf, setEntwurf] = useState<Eingaben>({});
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [archiv, setArchiv] = useState<BerichtArchiv[] | null>(null);
  const [nurOffene, setNurOffene] = useState(false);
  const [sicherung, setSicherung] = useState<{ art: 'ok' | 'laeuft' | 'fehler'; zeit?: number } | null>(null);
  const geaendert = useRef(new Set<string>());
  const aktuell = useRef({ entwurf, monat });
  aktuell.current = { entwurf, monat };
  const geladenFuer = useRef('');
  const laufendeSicherung = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (d.darfVerwalten) berichtArchivLaden().then(setArchiv).catch(() => setArchiv([]));
  }, [d.darfVerwalten]);
  useEffect(() => {
    zeitkontoLaden()
      .then(setZk)
      .catch((e: Error) => setMeldung({ ok: false, text: e.message }));
  }, []);

  /* Zwischengespeicherte Eingaben des Monats übernehmen (nur beim Öffnen/Monatswechsel, nicht während des Tippens). */
  useEffect(() => {
    if (!zk || geladenFuer.current === monat) return;
    geladenFuer.current = monat;
    geaendert.current.clear();
    setEntwurf(eingabenAus(zk, monat));
  }, [zk, monat]);

  const zwischenspeichern = useCallback((still = true) => {
    const { entwurf: e, monat: m } = aktuell.current;
    const emails = [...geaendert.current];
    if (!emails.length) {
      if (!still) setSicherung({ art: 'ok', zeit: Date.now() });
      return Promise.resolve();
    }
    geaendert.current.clear();
    const liste: MonatsEntwurf[] = emails.map((email) => ({
      email,
      monat: m,
      werte: Object.fromEntries(Object.entries(e[email] ?? {}).filter(([, v]) => v != null && v.trim() !== '').map(([k, v]) => [k, zahl(v!)])),
    }));
    setSicherung({ art: 'laeuft' });
    const vorher = laufendeSicherung.current;
    return (laufendeSicherung.current = vorher.then(() => zeitkontoEntwurf(liste))
      .then((x) => {
        setZk((alt) => (alt ? { ...alt, entwuerfe: x.entwuerfe } : x));
        setSicherung({ art: 'ok', zeit: Date.now() });
      })
      .catch(() => {
        for (const x of emails) geaendert.current.add(x);
        setSicherung({ art: 'fehler' });
      }));
  }, []);

  useEffect(() => {
    if (!geaendert.current.size) return;
    const t = setTimeout(() => void zwischenspeichern(), AUTOSPEICHERN_MS);
    return () => clearTimeout(t);
  }, [entwurf, zwischenspeichern]);
  useEffect(() => {
    const weg = () => document.visibilityState === 'hidden' && void zwischenspeichern();
    document.addEventListener('visibilitychange', weg);
    return () => {
      document.removeEventListener('visibilitychange', weg);
      void zwischenspeichern();
    };
  }, [zwischenspeichern]);

  const externe = useMemo(() => new Set(d.externe ?? []), [d.externe]);
  const personal = useMemo(
    () => d.personal.filter((p) => !externe.has(p.email) && p.eintritt.slice(0, 7) <= monat && (!p.austritt || p.austritt.slice(0, 7) >= monat)),
    [d.personal, externe, monat],
  );
  if (!zk) return meldung ? <div className="banner fehler">{meldung.text}</div> : <p className="leer">Lädt …</p>;

  const monatWechseln = (m: string) => {
    void zwischenspeichern();
    setMonat(m);
  };
  const e = zk.einstellungen;
  const abwMonat = monatPlus(monat, e.verschiebungAbw);
  const werte = (p: Personal): Werte & { kal: ReturnType<typeof kalenderTage> } => {
    const z = berichtZeile(p, d.eintraege, zk, monat);
    const x = entwurf[p.email] ?? {};
    const kal = kalenderTage(p, d.eintraege, abwMonat);
    const w = (k: WertSchluessel, s: number) => (x[k] != null && x[k]!.trim() !== '' ? zahl(x[k]!) : s);
    return { ue: w('ue', z.neu), ueAusb: w('ueAusb', z.ausbezahlt), kr: w('kr', z.kr), ur: w('ur', z.ur), so: w('so', z.so), kal };
  };
  const setze = (email: string, k: WertSchluessel, v: string | undefined) => {
    geaendert.current.add(email);
    const neu = { ...entwurf[email], [k]: v };
    if (v == null) delete neu[k];
    setEntwurf({ ...entwurf, [email]: neu });
  };
  const eintragVon = (p: Personal): MonatsEintrag => {
    const w = werte(p);
    return { email: p.email, monat, ue: w.ue, ueAusb: w.ueAusb, kr: runden(w.kr - w.kal.kr), ur: runden(w.ur - w.kal.ur), so: runden(w.so - w.kal.so) };
  };
  const speichern = (liste: Personal[], t: string) => {
    setLaeuft(true);
    for (const p of liste) geaendert.current.delete(p.email);
    const eintraege = liste.map(eintragVon);
    /* Erst nach laufenden Zwischenspeicherungen abschließen, sonst legt eine späte Sicherung den Entwurf wieder an. */
    laufendeSicherung.current
      .then(() => zeitkontoSpeichern(eintraege))
      .then((x) => {
        setZk(x);
        const rest = { ...aktuell.current.entwurf };
        for (const p of liste) delete rest[p.email];
        setEntwurf(rest);
        setMeldung({ ok: true, text: t });
      })
      .catch((x: Error) => setMeldung({ ok: false, text: x.message }))
      .finally(() => setLaeuft(false));
  };
  const loeschen = (p: Personal) => {
    if (!confirm(`Monatsabschluss ${monatText(monat)} für ${p.name} löschen? Abwesenheiten bleiben erhalten.`)) return;
    zeitkontoLoeschen(p.email, monat)
      .then((x) => {
        setZk((alt) => ({ ...x, entwuerfe: x.entwuerfe ?? alt?.entwuerfe }));
        setMeldung({ ok: true, text: `Monatsabschluss für ${p.name} gelöscht.` });
      })
      .catch((x: Error) => setMeldung({ ok: false, text: x.message }));
  };
  const einstellen = (k: 'verschiebungUe' | 'verschiebungAbw', v: number) =>
    zeitkontoEinstellungen({ ...e, [k]: v })
      .then(setZk)
      .catch((x: Error) => setMeldung({ ok: false, text: x.message }));

  const bericht = monatsbericht(d.personal.filter((p) => !externe.has(p.email)), d.eintraege, zk, monat);
  const anzahl = bericht.reduce((s, g) => s + g.zeilen.length, 0);
  const archivieren = (still = true) =>
    d.darfVerwalten &&
    berichtArchivieren(monat)
      .then((a) => {
        setArchiv(a);
        if (!still) setMeldung({ ok: true, text: `Monatsbericht ${monatText(monat)} ist im Archiv.` });
      })
      .catch((x: Error) => setMeldung({ ok: false, text: `Nicht archiviert: ${x.message}` }));
  const pdf = (aktion: 'laden' | 'drucken') => {
    void archivieren();
    return berichtAusgeben(bericht, monat, e, aktion).catch((x: Error) => setMeldung({ ok: false, text: `PDF nicht erstellt: ${x.message}` }));
  };
  const versendet = archiv?.find((b) => b.monat === monat);
  const nachtrag = versendet ? berichtNachtrag(versendet.gruppen, bericht) : [];
  const nachtragAusgeben = (art: 'laden' | 'drucken' | 'csv') => {
    if (!versendet) return;
    const fertig = art === 'csv' ? Promise.resolve(nachtragCsvLaden(nachtrag, monat)) : nachtragAusgabe(nachtrag, monat, e, versendet.erstellt, art);
    fertig.then(() => void archivieren()).catch((x: Error) => setMeldung({ ok: false, text: `Nachtrag nicht erstellt: ${x.message}` }));
  };

  const fertig = (p: Personal) => zk.eintraege.some((x) => x.email === p.email && x.monat === monat);
  const offen = personal.filter((p) => !fertig(p));
  const sichtbar = nurOffene ? offen : personal;
  const hatEntwurf = (p: Personal) => Object.values(entwurf[p.email] ?? {}).some((v) => v != null && v.trim() !== '');
  const entwuerfe = personal.filter(hatEntwurf).length;

  return (
    <div className="ab-zeitkonto">
      {meldung && <div className={`banner ${meldung.ok ? '' : 'fehler'}`}>{meldung.text}</div>}
      <section className="glas admin-block">
        <div className="zk-kopf">
          <h3>Zeitkonten</h3>
          <div className="zk-monat">
            <button className="knopf klein" onClick={() => monatWechseln(monatPlus(monat, -1))} aria-label="Vormonat">‹</button>
            <input className="feld" type="month" value={monat} onChange={(x) => x.target.value && monatWechseln(x.target.value)} />
            <button className="knopf klein" onClick={() => monatWechseln(monatPlus(monat, 1))} aria-label="Folgemonat">›</button>
          </div>
        </div>
        <p className="klein">
          Berichtsmonat {monatText(monat)}: Überstunden aus {monatText(monatPlus(monat, e.verschiebungUe))}, Fehltage (Krank, Urlaub, Sonstiges = Pflegeurlaub) aus {monatText(abwMonat)}.
          Fehltage sind aus Urlaub / Krank vorbelegt. Eingaben werden automatisch zwischengespeichert, erst „Abschließen“ übernimmt sie in den Bericht.
        </p>
        {personal.length > 0 && (
          <div className="zk-status">
            <div className="zk-fortschritt" title={`${personal.length - offen.length} von ${personal.length} abgeschlossen`}>
              <div style={{ width: `${((personal.length - offen.length) / personal.length) * 100}%` }} />
            </div>
            <span className="klein">
              <b>{personal.length - offen.length} von {personal.length}</b> abgeschlossen{entwuerfe ? ` · ${entwuerfe} mit Entwurf` : ''}
            </span>
            <label className="klein zk-filter">
              <input type="checkbox" checked={nurOffene} onChange={(x) => setNurOffene(x.target.checked)} /> nur offene
            </label>
            <span className={`klein zk-sicherung ${sicherung?.art ?? ''}`}>
              {sicherung?.art === 'laeuft' ? '💾 speichert …' : sicherung?.art === 'fehler' ? '⚠ nicht gesichert' : sicherung?.zeit ? `💾 gesichert ${uhrzeit(sicherung.zeit)}` : ''}
            </span>
          </div>
        )}
        <div className="zk-scroll">
          <table className="bs-tabelle zk-tabelle">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Ü-Übertrag</th>
                <th>Ü-Neu</th>
                <th>Ü-Ausz.</th>
                <th>Ü-Saldo</th>
                <th>Kr.</th>
                <th>Ur.</th>
                <th>So.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((p) => {
                const z = berichtZeile(p, d.eintraege, zk, monat);
                const w = werte(p);
                const saldo = runden(z.uebertrag + w.ue - w.ueAusb);
                const x = entwurf[p.email] ?? {};
                const entw = hatEntwurf(p);
                const feld = (k: WertSchluessel, titel: string) => (
                  <input
                    className={`feld zk-zahl ${x[k] != null && x[k]!.trim() !== '' ? 'geaendert' : ''}`}
                    inputMode="decimal"
                    enterKeyHint="next"
                    title={titel}
                    aria-label={`${p.name}: ${titel}`}
                    value={x[k] ?? text(w[k])}
                    onFocus={(ev) => ev.currentTarget.select()}
                    onKeyDown={weiter}
                    onChange={(ev) => setze(p.email, k, ev.target.value)}
                  />
                );
                const tage = (k: 'kr' | 'ur' | 'so', titel: string) => (
                  <>
                    {feld(k, `${titel}, laut Kalender ${text(w.kal[k])}`)}
                    {runden(w[k]) !== runden(w.kal[k]) && (
                      <button className="knopf klein" title={`Auf Kalenderwert ${text(w.kal[k])} zurücksetzen`} onClick={() => setze(p.email, k, text(w.kal[k]))}>
                        ↺ {text(w.kal[k])}
                      </button>
                    )}
                  </>
                );
                const za = w.kal.za * stundenJeTag(p);
                return (
                  <tr key={p.email} className={`${z.abgeschlossen ? 'zk-fertig' : ''} ${entw ? 'zk-entwurf' : ''}`}>
                    <td data-label="">
                      <b>{p.name}</b>
                      <div className="klein">
                        {z.abgeschlossen ? '✓ abgeschlossen' : 'offen'}
                        {entw ? (z.abgeschlossen ? ' · ✎ Änderung nicht übernommen' : ' · ✎ Entwurf') : ''}
                        {p.gruppe ? ` · ${p.gruppe}` : ''}
                      </div>
                    </td>
                    <td data-label="Ü-Übertrag">
                      {korr?.email === p.email ? (
                        <form
                          className="zk-korr"
                          onSubmit={(ev) => {
                            ev.preventDefault();
                            uebertragKorrigieren(p, korr.wert);
                          }}
                        >
                          <input className="feld zk-zahl" inputMode="decimal" autoFocus value={korr.wert} onChange={(ev) => setKorr({ ...korr, wert: ev.target.value })} aria-label={`${p.name}: Ü-Übertrag korrigieren`} />
                          <button type="submit" className="knopf klein" title="Übertrag ab diesem Monat setzen">✓</button>
                          <button type="button" className="knopf klein" onClick={() => setKorr(null)}>✕</button>
                        </form>
                      ) : d.darfVerwalten ? (
                        <button type="button" className="zk-korr-knopf" title="Ü-Übertrag ab diesem Monat korrigieren" onClick={() => setKorr({ email: p.email, wert: text(z.uebertrag) })}>
                          {text(z.uebertrag)} h ✎
                        </button>
                      ) : (
                        `${text(z.uebertrag)} h`
                      )}
                    </td>
                    <td data-label="Ü-Neu">
                      {feld('ue', 'Neue Überstunden im Monat (h)')}
                      {za > 0 && (
                        <button className="knopf klein" title={`${w.kal.za} ZA-Tage × ${stundenJeTag(p)} h`} onClick={() => setze(p.email, 'ue', text(runden(w.ue - za)))}>
                          −ZA {text(runden(za))}
                        </button>
                      )}
                    </td>
                    <td data-label="Ü-Ausz.">
                      {feld('ueAusb', 'Davon ausbezahlt (h)')}
                      <button className="knopf klein" title="Gesamten Saldo auszahlen" onClick={() => setze(p.email, 'ueAusb', text(runden(z.uebertrag + w.ue)))}>alles</button>
                    </td>
                    <td data-label="Ü-Saldo" className={saldo < 0 ? 'zk-minus' : ''}>{text(saldo)} h</td>
                    <td data-label="Krank">{tage('kr', 'Krank (Tage)')}</td>
                    <td data-label="Urlaub">{tage('ur', 'Urlaub (Tage)')}</td>
                    <td data-label="Sonstiges">{tage('so', 'Sonstiges/Pflegeurlaub (Tage)')}</td>
                    <td data-label="" className="zk-zeilenknoepfe">
                      <button className="knopf klein primaer" disabled={laeuft} onClick={() => speichern([p], `${p.name}: ${monatText(monat)} abgeschlossen.`)}>
                        {z.abgeschlossen ? (entw ? 'Übernehmen' : 'Speichern') : 'Abschließen'}
                      </button>
                      {entw && (
                        <button
                          className="knopf klein"
                          title="Entwurf verwerfen"
                          onClick={() => {
                            geaendert.current.add(p.email);
                            setEntwurf({ ...entwurf, [p.email]: {} });
                          }}
                        >
                          ↶
                        </button>
                      )}
                      {z.abgeschlossen && (
                        <button className="knopf klein" onClick={() => loeschen(p)} aria-label="Monatsabschluss löschen">✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!personal.length && <p className="leer">Keine Mitarbeiter in diesem Monat. Personal legst du unter „Personal“ an.</p>}
        {personal.length > 0 && !sichtbar.length && <p className="leer">Alle Mitarbeiter sind abgeschlossen.</p>}
        {personal.length > 0 && (
          <div className="zk-aktionen">
            <button className="knopf" disabled={sicherung?.art === 'laeuft'} onClick={() => void zwischenspeichern(false)}>💾 Zwischenspeichern</button>
            <button className="knopf primaer" disabled={laeuft} onClick={() => speichern(personal, `${monatText(monat)} für ${personal.length} Mitarbeiter abgeschlossen.`)}>
              Monat für alle abschließen{offen.length ? ` (${offen.length} offen)` : ''}
            </button>
          </div>
        )}
      </section>

      <section className="glas admin-block">
        <h3>Monatsbericht für die Buchhaltung</h3>
        <p className="klein">{berichtHinweis(monat, e)}</p>
        <p className="klein">{anzahl ? `${anzahl} abgeschlossene Mitarbeiter in ${bericht.length} Gruppe(n).` : 'Für diesen Monat ist noch niemand abgeschlossen.'}</p>
        <div className="zk-aktionen">
          <button className="knopf primaer" disabled={!anzahl} onClick={() => pdf('laden')}>⬇ PDF</button>
          <button className="knopf" disabled={!anzahl} onClick={() => pdf('drucken')}>🖨 Drucken</button>
          <button className="knopf" disabled={!anzahl} onClick={() => { void archivieren(); csvLaden(bericht, monat); }}>
            ⬇ CSV (Excel)
          </button>
          {d.darfVerwalten && (
            <button className="knopf" disabled={!anzahl} onClick={() => void archivieren(false)} title="Fester Stand – wird beim Herunterladen und Drucken auch automatisch abgelegt">
              📁 Archivieren
            </button>
          )}
        </div>
        {versendet && nachtrag.length > 0 && (
          <div className="zk-nachtrag">
            <b>⚠ Seit dem Bericht vom {standText(versendet.erstellt)} geändert: {nachtrag.length} Mitarbeiter</b>
            <ul className="klein">
              {nachtrag.map((z) => (
                <li key={z.email}>
                  {z.name}: {nachtragText(z)}
                </li>
              ))}
            </ul>
            <div className="zk-aktionen">
              <button className="knopf primaer" onClick={() => nachtragAusgeben('laden')}>⬇ Nachtrag-PDF</button>
              <button className="knopf" onClick={() => nachtragAusgeben('drucken')}>🖨 Nachtrag drucken</button>
              <button className="knopf" onClick={() => nachtragAusgeben('csv')}>⬇ Nachtrag-CSV</button>
            </div>
            <p className="klein">Der Nachtrag enthält nur diese Mitarbeiter (bisher → neu). Danach gilt der aktuelle Stand als versendet.</p>
          </div>
        )}
        <div className="zk-einstellungen">
          <label>
            Überstunden aus
            <select className="feld" value={e.verschiebungUe} onChange={(x) => einstellen('verschiebungUe', Number(x.target.value))}>
              {VERSCHIEBUNG.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Fehltage aus
            <select className="feld" value={e.verschiebungAbw} onChange={(x) => einstellen('verschiebungAbw', Number(x.target.value))}>
              {VERSCHIEBUNG.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        {d.darfVerwalten && <BriefpapierWahl da={!!zk.briefpapier} onDa={(da) => setZk({ ...zk, briefpapier: da })} onMeldung={setMeldung} />}
      </section>
      {d.darfVerwalten && <BerichtArchivListe archiv={archiv} onArchiv={setArchiv} onFehler={(t) => setMeldung({ ok: false, text: t })} />}
    </div>
  );
}

/** Briefpapier (Hintergrund des PDF-Berichts) hinterlegen oder ersetzen. */
function BriefpapierWahl({ da, onDa, onMeldung }: { da: boolean; onDa: (da: boolean) => void; onMeldung: (m: { ok: boolean; text: string }) => void }) {
  const eingabe = useRef<HTMLInputElement>(null);
  const hochladen = (f: File | undefined) => {
    if (!f) return;
    briefpapierHochladen(f)
      .then(() => {
        onDa(true);
        onMeldung({ ok: true, text: 'Briefpapier gespeichert. Es liegt ab jetzt im Hintergrund jeder PDF-Seite.' });
      })
      .catch((x: Error) => onMeldung({ ok: false, text: x.message }));
  };
  return (
    <div className="zk-briefpapier klein">
      <span>🖼 Briefpapier: {da ? 'hinterlegt (A4, Inhalt ab 45 mm von oben)' : 'keines – PDF ohne Hintergrund'}</span>
      <input ref={eingabe} type="file" accept="image/jpeg,image/png" hidden onChange={(x) => hochladen(x.target.files?.[0])} />
      <button className="knopf klein" onClick={() => eingabe.current?.click()}>{da ? 'Ersetzen' : 'Hochladen'}</button>
      {da && (
        <button
          className="knopf klein gefahr"
          onClick={() =>
            confirm('Briefpapier entfernen? Berichte haben dann keinen Hintergrund mehr.') &&
            briefpapierEntfernen()
              .then(() => onDa(false))
              .catch((x: Error) => onMeldung({ ok: false, text: x.message }))
          }
        >
          Entfernen
        </button>
      )}
    </div>
  );
}

const dateinameVon = (monat: string) => `Monatsbericht_${monat.slice(5, 7)}_${monat.slice(0, 4)}`;
const berichtAusgeben = (g: BerichtGruppen, monat: string, e: ZeitkontoEinstellungen, aktion: 'laden' | 'drucken', zusatz = '') =>
  berichtPdf(g, monat, e).then((b) => (aktion === 'laden' ? herunterladen(b, `${dateinameVon(monat)}${zusatz}.pdf`) : drucken(b, 'application/pdf')));
const csvLaden = (g: BerichtGruppen, monat: string, zusatz = '') =>
  herunterladen(new Blob([berichtCsv(g)], { type: 'text/csv;charset=utf-8' }), `${dateinameVon(monat)}${zusatz}.csv`);

const nachtragAusgabe = (z: NachtragZeile[], monat: string, e: ZeitkontoEinstellungen, seit: number, aktion: 'laden' | 'drucken', zusatz = '') =>
  nachtragPdf(z, monat, e, seit).then((b) =>
    aktion === 'laden' ? herunterladen(b, `${dateinameVon(monat)}_Nachtrag${zusatz || `_${new Date().toISOString().slice(0, 10)}`}.pdf`) : drucken(b, 'application/pdf'),
  );
const nachtragCsvLaden = (z: NachtragZeile[], monat: string, zusatz = '') =>
  herunterladen(new Blob([nachtragCsv(z)], { type: 'text/csv;charset=utf-8' }), `${dateinameVon(monat)}_Nachtrag${zusatz || `_${new Date().toISOString().slice(0, 10)}`}.csv`);

/** Archiv der Monatsberichte: je Monat alle abgelegten Stände, neuester zuerst. */
function BerichtArchivListe({ archiv, onArchiv, onFehler }: { archiv: BerichtArchiv[] | null; onArchiv: (a: BerichtArchiv[]) => void; onFehler: (t: string) => void }) {
  const [jahr, setJahr] = useState('');
  if (!archiv) return null;
  const jahre = [...new Set(archiv.map((b) => b.monat.slice(0, 4)))];
  const liste = archiv.filter((b) => !jahr || b.monat.startsWith(jahr));
  const monate = [...new Set(liste.map((b) => b.monat))];
  const stand = (b: BerichtArchiv) => new Date(b.erstellt).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
  const fehler = (x: Error) => onFehler(x.message);
  return (
    <section className="glas admin-block">
      <div className="zk-archiv-kopf">
        <h3>📁 Archiv Monatsberichte</h3>
        {jahre.length > 1 && (
          <select className="feld" value={jahr} onChange={(x) => setJahr(x.target.value)}>
            <option value="">Alle Jahre</option>
            {jahre.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        )}
      </div>
      {!monate.length && <p className="leer">Noch nichts archiviert. Beim Herunterladen oder Drucken wird der Bericht automatisch abgelegt.</p>}
      {monate.map((m) => {
        const staende = liste.filter((b) => b.monat === m);
        return (
          <div key={m} className="zk-archiv-monat">
            <b>{monatText(m)}</b>
            {staende.map((b, i) => {
              const n = b.gruppen.reduce((s, g) => s + g.zeilen.length, 0);
              const zusatz = i ? `_Stand_${new Date(b.erstellt).toISOString().slice(0, 10)}` : '';
              return (
                <div key={b.id} className={`zk-archiv-stand ${i ? 'alt' : ''}`}>
                  <span className="klein">
                    {i ? 'älterer Stand' : 'aktuell'} · {stand(b)} · {b.von} · {n} Mitarbeiter
                  </span>
                  <span className="zk-aktionen">
                    <button className="knopf klein" onClick={() => berichtAusgeben(b.gruppen, b.monat, b.einstellungen, 'laden', zusatz).catch(fehler)}>⬇ PDF</button>
                    <button className="knopf klein" onClick={() => berichtAusgeben(b.gruppen, b.monat, b.einstellungen, 'drucken').catch(fehler)}>🖨</button>
                    <button className="knopf klein" onClick={() => csvLaden(b.gruppen, b.monat, zusatz)}>CSV</button>
                    {staende[i + 1] && (
                      <button
                        className="knopf klein"
                        title={`Nachtrag: Änderungen gegenüber dem Stand vom ${stand(staende[i + 1])}`}
                        onClick={() => {
                          const z = berichtNachtrag(staende[i + 1].gruppen, b.gruppen);
                          if (!z.length) return onFehler('Keine Änderungen gegenüber dem vorigen Stand.');
                          nachtragAusgabe(z, b.monat, b.einstellungen, staende[i + 1].erstellt, 'laden', `_${new Date(b.erstellt).toISOString().slice(0, 10)}`).catch(fehler);
                        }}
                      >
                        Nachtrag
                      </button>
                    )}
                    <button
                      className="knopf klein gefahr"
                      title="Aus dem Archiv entfernen"
                      onClick={() => confirm(`Stand vom ${stand(b)} für ${monatText(b.monat)} aus dem Archiv entfernen?`) && berichtArchivEntfernen(b).then(onArchiv).catch(fehler)}
                    >
                      🗑
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
