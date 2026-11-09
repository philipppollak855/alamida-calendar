import { useEffect, useMemo, useState } from 'react';
import type { Personal } from '../shared/abwesenheit';
import { stundenJeTag } from '../shared/abwesenheit';
import {
  berichtCsv,
  berichtHinweis,
  berichtZeile,
  kalenderTage,
  monatPlus,
  monatsbericht,
  monatText,
  runden,
  type MonatsEintrag,
  type ZeitkontoDaten,
} from '../shared/zeitkonto';
import { zeitkontoEinstellungen, zeitkontoLaden, zeitkontoLoeschen, zeitkontoSpeichern, type AbwesenheitDaten } from './api';
import { drucken, herunterladen } from './beleg';
import { berichtPdf } from './zeitkontoPdf';

type Werte = { ue: number; ueAusb: number; kr: number; ur: number; so: number };

const heuteMonat = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const zahl = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return isFinite(n) ? runden(n) : 0;
};
const VERSCHIEBUNG: [number, string][] = [
  [-1, 'Vormonat (−1)'],
  [0, 'Berichtsmonat (0)'],
  [1, 'Folgemonat (+1)'],
];

/** Überstunden, Auszahlung, Saldo und Fehltage je Monat pflegen; Monatsbericht für die Buchhaltung (PDF, CSV). */
export default function ZeitkontoAnsicht({ d }: { d: AbwesenheitDaten }) {
  const [zk, setZk] = useState<ZeitkontoDaten | null>(null);
  const [monat, setMonat] = useState(() => monatPlus(heuteMonat(), -1));
  const [entwurf, setEntwurf] = useState<Record<string, Partial<Record<keyof Werte, string>>>>({});
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    zeitkontoLaden()
      .then(setZk)
      .catch((e: Error) => setMeldung({ ok: false, text: e.message }));
  }, []);
  useEffect(() => setEntwurf({}), [monat]);

  const externe = useMemo(() => new Set(d.externe ?? []), [d.externe]);
  const personal = useMemo(
    () => d.personal.filter((p) => !externe.has(p.email) && p.eintritt.slice(0, 7) <= monat && (!p.austritt || p.austritt.slice(0, 7) >= monat)),
    [d.personal, externe, monat],
  );
  if (!zk) return meldung ? <div className="banner fehler">{meldung.text}</div> : <p className="leer">Lädt …</p>;

  const e = zk.einstellungen;
  const abwMonat = monatPlus(monat, e.verschiebungAbw);
  const werte = (p: Personal): Werte & { kal: ReturnType<typeof kalenderTage> } => {
    const z = berichtZeile(p, d.eintraege, zk, monat);
    const x = entwurf[p.email] ?? {};
    const kal = kalenderTage(p, d.eintraege, abwMonat);
    const w = (k: keyof Werte, s: number) => (x[k] != null ? zahl(x[k]!) : s);
    return { ue: w('ue', z.neu), ueAusb: w('ueAusb', z.ausbezahlt), kr: w('kr', z.kr), ur: w('ur', z.ur), so: w('so', z.so), kal };
  };
  const setze = (email: string, k: keyof Werte, v: string) => setEntwurf({ ...entwurf, [email]: { ...entwurf[email], [k]: v } });
  const eintragVon = (p: Personal): MonatsEintrag => {
    const w = werte(p);
    return { email: p.email, monat, ue: w.ue, ueAusb: w.ueAusb, kr: runden(w.kr - w.kal.kr), ur: runden(w.ur - w.kal.ur), so: runden(w.so - w.kal.so) };
  };
  const speichern = (liste: Personal[], text: string) => {
    setLaeuft(true);
    zeitkontoSpeichern(liste.map(eintragVon))
      .then((x) => {
        setZk(x);
        setEntwurf({});
        setMeldung({ ok: true, text });
      })
      .catch((x: Error) => setMeldung({ ok: false, text: x.message }))
      .finally(() => setLaeuft(false));
  };
  const loeschen = (p: Personal) => {
    if (!confirm(`Monatsabschluss ${monatText(monat)} für ${p.name} löschen? Abwesenheiten bleiben erhalten.`)) return;
    zeitkontoLoeschen(p.email, monat)
      .then((x) => {
        setZk(x);
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
  const dateiname = `Monatsbericht_${monat.slice(5, 7)}_${monat.slice(0, 4)}`;
  const pdf = (aktion: 'laden' | 'drucken') =>
    berichtPdf(bericht, monat, e)
      .then((b) => (aktion === 'laden' ? herunterladen(b, `${dateiname}.pdf`) : drucken(b, 'application/pdf')))
      .catch((x: Error) => setMeldung({ ok: false, text: `PDF nicht erstellt: ${x.message}` }));
  const offen = personal.filter((p) => !zk.eintraege.some((x) => x.email === p.email && x.monat === monat));

  return (
    <div className="ab-zeitkonto">
      {meldung && <div className={`banner ${meldung.ok ? '' : 'fehler'}`}>{meldung.text}</div>}
      <section className="glas admin-block">
        <div className="zk-kopf">
          <h3>Zeitkonten</h3>
          <div className="zk-monat">
            <button className="knopf klein" onClick={() => setMonat(monatPlus(monat, -1))} aria-label="Vormonat">‹</button>
            <input className="feld" type="month" value={monat} onChange={(x) => x.target.value && setMonat(x.target.value)} />
            <button className="knopf klein" onClick={() => setMonat(monatPlus(monat, 1))} aria-label="Folgemonat">›</button>
          </div>
        </div>
        <p className="klein">
          Berichtsmonat {monatText(monat)}: Überstunden aus {monatText(monatPlus(monat, e.verschiebungUe))}, Fehltage (Krank, Urlaub, Sonstiges = Pflegeurlaub) aus {monatText(abwMonat)}.
          Fehltage sind aus Urlaub / Krank vorbelegt und lassen sich korrigieren. „Abschließen“ übernimmt den Monat in den Bericht.
        </p>
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
              {personal.map((p) => {
                const z = berichtZeile(p, d.eintraege, zk, monat);
                const w = werte(p);
                const saldo = runden(z.uebertrag + w.ue - w.ueAusb);
                const x = entwurf[p.email] ?? {};
                const feld = (k: keyof Werte, step: number, titel: string) => (
                  <input className="feld zk-zahl" inputMode="decimal" title={titel} value={x[k] ?? String(w[k]).replace('.', ',')} onChange={(ev) => setze(p.email, k, ev.target.value)} step={step} />
                );
                const za = w.kal.za * stundenJeTag(p);
                return (
                  <tr key={p.email} className={z.abgeschlossen ? 'zk-fertig' : ''}>
                    <td>
                      <b>{p.name}</b>
                      <div className="klein">{z.abgeschlossen ? '✓ abgeschlossen' : 'offen'}{p.gruppe ? ` · ${p.gruppe}` : ''}</div>
                    </td>
                    <td>{String(z.uebertrag).replace('.', ',')} h</td>
                    <td>
                      {feld('ue', 0.25, 'Neue Überstunden im Monat (h)')}
                      {za > 0 && (
                        <button className="knopf klein" title={`${w.kal.za} ZA-Tage × ${stundenJeTag(p)} h`} onClick={() => setze(p.email, 'ue', String(runden(w.ue - za)))}>
                          −ZA {String(runden(za)).replace('.', ',')}
                        </button>
                      )}
                    </td>
                    <td>
                      {feld('ueAusb', 0.25, 'Davon ausbezahlt (h)')}
                      <button className="knopf klein" title="Gesamten Saldo auszahlen" onClick={() => setze(p.email, 'ueAusb', String(runden(z.uebertrag + w.ue)))}>alles</button>
                    </td>
                    <td className={saldo < 0 ? 'zk-minus' : ''}>{String(saldo).replace('.', ',')} h</td>
                    <td>{feld('kr', 1, `Krank (Tage), laut Kalender ${w.kal.kr}`)}</td>
                    <td>{feld('ur', 1, `Urlaub (Tage), laut Kalender ${w.kal.ur}`)}</td>
                    <td>{feld('so', 1, `Sonstiges/Pflegeurlaub (Tage), laut Kalender ${w.kal.so}`)}</td>
                    <td>
                      <button className="knopf klein primaer" disabled={laeuft} onClick={() => speichern([p], `${p.name}: ${monatText(monat)} abgeschlossen.`)}>
                        {z.abgeschlossen ? 'Speichern' : 'Abschließen'}
                      </button>
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
        {personal.length > 0 && (
          <div className="zk-aktionen">
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
          <button className="knopf" disabled={!anzahl} onClick={() => herunterladen(new Blob([berichtCsv(bericht)], { type: 'text/csv;charset=utf-8' }), `${dateiname}.csv`)}>
            ⬇ CSV (Excel)
          </button>
        </div>
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
      </section>
    </div>
  );
}
