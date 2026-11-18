import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { standText } from './offlineCache';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  abwesenheitAendern,
  abwesenheitEintragen,
  abwesenheitEntscheiden,
  abwesenheitLaden,
  abwesenheitLoeschen,
  abwesenheitVerlaengern,
  altdatenImportieren,
  belegDatei,
  belegEntfernen,
  belegHochladen,
  personalSpeichern,
  type AbwesenheitDaten,
} from './api';
import {
  ARTEN,
  ART_LISTE,
  altdatenLesen,
  arbeitstage,
  gueltigesDatum,
  istFeiertag,
  stundenVon,
  tageListe,
  urlaubskonto,
  type Urlaubskonto,
  zaehlt,
  type AbwArt,
  type Abwesenheit,
  type AltMitarbeiter,
  type Personal,
  type Beleg,
  BELEG_ARTEN,
  belegFehlt,
  belegMoeglich, internesKonto, OFFEN_ARTEN, wartet, istOhneEmail, sollStunden, stundenJeTag, tageAnzeige } from '../shared/abwesenheit';
import { ausText, datumText, plusTage } from '../shared/bereitschaft';
import { useBereitschaft } from './BereitschaftAnsicht';
import { belegVorbereiten, drucken, herunterladen } from './beleg';
import ZeitkontoAnsicht from './ZeitkontoAnsicht';
import { altEintraegeLesen, berichtZeile, gueltigerMonat, kalenderTage, monatPlus, monatText, runden, zahlText, type BerichtZeile, type ZeitkontoDaten } from '../shared/zeitkonto';
import { berichtLesen, nameZuordnen, tageZuAbwesenheiten, type BerichtZeile as ImportBerichtZeile, type ImportAbwesenheit } from '../shared/altImport';
import { excelLesen, pdfZeilen } from './altImport';
import { zeitkontoLaden, zeitkontoSpeichern } from './api';

/** Lädt Urlaub/Krank (nur mit Freigabe). */
export function useAbwesenheit(aktiv: boolean) {
  const [daten, setDaten] = useState<AbwesenheitDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const laden = useCallback(() => {
    if (!aktiv) return;
    abwesenheitLaden()
      .then((d) => {
        setDaten(d);
        setFehler(d.offlineStand ? standText(d.offlineStand) : null);
      })
      .catch((e: Error) => setFehler(e.message));
  }, [aktiv]);
  useEffect(() => {
    laden();
    if (!aktiv) return;
    const t = setInterval(laden, 120_000);
    return () => clearInterval(t);
  }, [aktiv, laden]);
  return { daten, setDaten, fehler, setFehler, laden };
}

const heute = () => datumText(new Date());
const std = (n: number) => `${n.toLocaleString('de-AT', { maximumFractionDigits: 1 })} h`;
const tage = tageAnzeige;
const kurz = (email: string) => email.split('@')[0];
const artInfo = (e: Abwesenheit) => (e.verdeckt ? { label: 'abwesend', symbol: '•', farbe: '#7f8c8d' } : ARTEN[e.art]);
const STATUS: Record<Abwesenheit['status'], string> = { beantragt: 'offen', genehmigt: 'genehmigt', abgelehnt: 'abgelehnt', gemeldet: 'gemeldet' };
const WARN_AB = 3;

/** Datum anzeigen; halb eingetippte oder leere Werte aus Datumsfeldern ergeben „…“ statt eines Absturzes. */
const datum = (t: string, muster: string) => (gueltigesDatum(t) ? format(ausText(t), muster, { locale: de }) : '…');
const datumKurz = (t: string) => datum(t, 'EEE d.M.yyyy');

function zeitraumText(e: Pick<Abwesenheit, 'von' | 'bis' | 'stunden'> & { offen?: boolean }): string {
  if (e.offen) return `seit ${datumKurz(e.von)} · bis auf Weiteres`;
  if (e.von === e.bis) return datumKurz(e.von) + (e.stunden ? ` · ${e.stunden} h` : '');
  return `${datum(e.von, 'EEE d.M.')} – ${datumKurz(e.bis)}`;
}

function nameVon(d: AbwesenheitDaten, email: string): string {
  return (
    d.personen.find((p) => p.email === email)?.name ||
    d.personal.find((p) => p.email === email)?.name ||
    d.eintraege.find((e) => e.email === email && e.name)?.name ||
    (email === d.ich.email ? d.ich.name : undefined) ||
    kurz(email)
  );
}

/** Wer an einem Tag fehlt (genehmigt oder krank gemeldet), z. B. für den Tagesplan. */
export function abwesendAm(eintraege: Abwesenheit[], tag: string): Abwesenheit[] {
  return eintraege.filter((e) => zaehlt(e) && e.von <= tag && e.bis >= tag);
}

export function AbwesenheitZeile({ eintraege }: { eintraege: Abwesenheit[] }) {
  if (!eintraege.length) return null;
  return (
    <div className="bereitschaft-hinweis">
      <span>🌴 Abwesend:</span>
      {eintraege.map((e) => (
        <span key={e.id} className="pille an" style={{ borderColor: artInfo(e).farbe }} title={artInfo(e).label}>
          {artInfo(e).symbol} {e.name || kurz(e.email)}
          {e.stunden ? <small> {e.stunden} h</small> : null}
        </span>
      ))}
    </div>
  );
}

function Kachel({ label, wert, klein, klasse, unter }: { label: string; wert: string | number; klein?: string; klasse?: string; unter?: string }) {
  return (
    <div className="kachel glas">
      <div className="kachel-label">{label}</div>
      <div className={`kachel-wert ${klasse ?? ''}`}>
        {wert} {klein && <small>{klein}</small>}
      </div>
      {unter && <div className="kachel-unter">{unter}</div>}
    </div>
  );
}

function krankTageImJahr(p: Personal, eintraege: Abwesenheit[], jahr: number): number {
  const a = `${jahr}-01-01`;
  const b = `${jahr}-12-31`;
  return eintraege
    .filter((e) => e.email === p.email && e.art === 'krank' && zaehlt(e) && e.bis >= a && e.von <= b)
    .reduce((s, e) => s + arbeitstage(p, { ...e, von: e.von > a ? e.von : a, bis: e.bis < b ? e.bis : b }), 0);
}

const restUnter = (k: Urlaubskonto) =>
  `heute ${tage(k.rest, k.stundenProTag)}${k.vorgeplant ? ` · vorgeplant −${tage(k.vorgeplant, k.stundenProTag)}` : ''}${k.beantragt ? ` · beantragt −${tage(k.beantragt, k.stundenProTag)}` : ''}`;

function KontoKacheln({ p, eintraege }: { p: Personal; eintraege: Abwesenheit[] }) {
  const k = useMemo(() => urlaubskonto(p, eintraege, heute()), [p, eintraege]);
  return (
    <div className="bs-kacheln ab-kacheln">
      <Kachel label="Resturlaub" wert={tage(k.restGeplant, k.stundenProTag)} klasse={k.restGeplant < 0 ? 'bs-warn' : 'bs-ok'} unter={restUnter(k)} />
      <Kachel label="Verplant / beantragt" wert={tage(k.verplant, k.stundenProTag)} klasse="bs-klein" unter={`${tage(k.vorgeplant, k.stundenProTag)} genehmigt · ${tage(k.beantragt, k.stundenProTag)} offen`} />
      {!p.ohneVerfall && <Kachel label="Verfällt in 3 Monaten" wert={tage(k.verfaelltBald, k.stundenProTag)} klasse={k.verfaelltBald > 0 ? 'bs-warn bs-klein' : 'bs-klein'} />}
      <Kachel label="Pflegefreistellung" wert={`${tage(k.pflege.verbraucht, k.stundenProTag)} / ${tage(k.pflege.anspruch, k.stundenProTag)}`} klasse="bs-klein" />
      <Kachel label={`Krankentage ${new Date().getFullYear()}`} wert={krankTageImJahr(p, eintraege, new Date().getFullYear())} klasse="bs-klein" />
    </div>
  );
}

function Formular({ d, onDaten, start, onFertig }: { d: AbwesenheitDaten; onDaten: (x: AbwesenheitDaten) => void; start?: { email: string; von: string }; onFertig?: () => void }) {
  const [email, setEmail] = useState(start?.email ?? d.ich.email);
  const [art, setArt] = useState<AbwArt>('urlaub');
  const [von, setVon] = useState(start?.von ?? heute());
  const [bis, setBis] = useState(start?.von ?? heute());
  const [genehmigen, setGenehmigen] = useState(false);
  const [stundenweise, setStundenweise] = useState(false);
  const [stunden, setStunden] = useState(4);
  const [offenWahl, setOffenWahl] = useState(false);
  const [notiz, setNotiz] = useState('');
  const [datei, setDatei] = useState<File | null>(null);
  const [dateiFeld, setDateiFeld] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const p = d.personal.find((x) => x.email === email);
  const offen = offenWahl && !stundenweise && OFFEN_ARTEN.includes(art);
  const bisWert = stundenweise || offen ? von : bis;
  const kosten = p && gueltigesDatum(von) && gueltigesDatum(bisWert) && bisWert >= von && !offen ? stundenVon(p, { id: '', email, art, von, bis: bisWert, status: 'beantragt', ...(stundenweise ? { stunden } : {}) }) : null;
  const personen = [...new Map([[d.ich.email, d.ich.email], ...d.personen.map((x) => [x.email, x.email] as const)]).keys()];

  const senden = () => {
    setLaeuft(true);
    setMeldung(null);
    const sofortGenehmigt = d.darfVerwalten && genehmigen && ARTEN[art].genehmigung;
    abwesenheitEintragen({ email, art, von, bis: bisWert, ...(stundenweise ? { stunden } : {}), ...(offen ? { offen: true } : {}), ...(notiz.trim() ? { notiz: notiz.trim() } : {}), ...(sofortGenehmigt ? { genehmigen: true } : {}) })
      .then(async (x) => {
        onDaten(x);
        setNotiz('');
        const basis =
          art === 'krank'
            ? 'Krankmeldung gesendet. Gute Besserung!'
            : sofortGenehmigt
              ? 'Eingetragen und genehmigt.'
              : d.darfVerwalten
                ? 'Eingetragen – wartet auf Genehmigung (Dashboard / Alle Einträge).'
                : 'Antrag gesendet. Du siehst hier, sobald er genehmigt ist.';
        const mitBeleg = BELEG_ARTEN.includes(art);
        const neu = x.eintraege
          .filter((z) => z.email === email && z.art === art && z.von === von && z.bis === bisWert)
          .sort((a, b) => (b.erstellt ?? 0) - (a.erstellt ?? 0))[0];
        if (mitBeleg && datei && neu) {
          try {
            const v = await belegVorbereiten(datei);
            onDaten(await belegHochladen(neu.id, v.datei, v.name));
            setMeldung({ ok: true, text: `${basis} Die Bestätigung ist übermittelt.` });
          } catch (f) {
            setMeldung({ ok: false, text: `${basis} Die Datei konnte nicht übertragen werden (${(f as Error).message}) – bitte unter „Meine Einträge“ nachreichen.` });
          }
        } else {
          setMeldung({ ok: true, text: mitBeleg ? `${basis} Die Bestätigung kannst du jederzeit unter „Meine Einträge“ nachreichen.` : basis });
        }
        setDatei(null);
        setDateiFeld((n) => n + 1);
        onFertig?.();
      })
      .catch((e: Error) => setMeldung({ ok: false, text: e.message }))
      .finally(() => setLaeuft(false));
  };

  return (
    <article className="glas admin-block ab-formular">
      <h3>{art === 'krank' ? 'Krank melden' : 'Abwesenheit eintragen'}</h3>
      <div className="ab-arten">
        {ART_LISTE.map((a) => (
          <button key={a} className={`pille ${art === a ? 'an' : ''}`} style={art === a ? { borderColor: ARTEN[a].farbe } : undefined} onClick={() => setArt(a)}>
            {ARTEN[a].symbol} {ARTEN[a].label}
          </button>
        ))}
      </div>
      {d.darfVerwalten && (
        <label className="ab-feld">
          Mitarbeiter
          <select className="feld" value={email} onChange={(e) => setEmail(e.target.value)}>
            {personen.map((m) => (
              <option key={m} value={m}>
                {nameVon(d, m)}
                {m === d.ich.email ? ' (ich)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="ab-zeile">
        <label className="ab-feld">
          {stundenweise ? 'Tag' : 'Von'}
          <input className="feld" type="date" value={von} onChange={(e) => { setVon(e.target.value); if (e.target.value > bis) setBis(e.target.value); }} />
        </label>
        {!stundenweise && !offen && (
          <label className="ab-feld">
            Bis
            <input className="feld" type="date" value={bis} min={von} onChange={(e) => setBis(e.target.value)} />
          </label>
        )}
        {stundenweise && (
          <label className="ab-feld">
            Stunden
            <input className="feld" type="number" min={0.5} max={24} step={0.5} value={stunden} onChange={(e) => setStunden(Number(e.target.value))} />
          </label>
        )}
      </div>
      <label className="pille-wahl">
        <input type="checkbox" checked={stundenweise} onChange={() => setStundenweise(!stundenweise)} /> Stundenweise (einzelner Tag)
      </label>
      {OFFEN_ARTEN.includes(art) && !stundenweise && (
        <label className="pille-wahl" title="Der Eintrag läuft weiter, bis du „Gesund gemeldet“ bzw. „Beenden“ drückst">
          <input type="checkbox" checked={offenWahl} onChange={() => setOffenWahl(!offenWahl)} /> bis auf Weiteres ({art === 'krank' ? 'bis zur Gesundmeldung' : 'Ende noch offen'})
        </label>
      )}
      {offen && <p className="klein">Läuft ab {datumKurz(von)}, bis du unter „Meine Einträge“ {art === 'krank' ? '„Gesund gemeldet“' : '„Beenden“'} drückst.</p>}
      <textarea className="feld" rows={2} placeholder={art === 'krank' ? 'Notiz (optional, z. B. voraussichtliche Dauer)' : 'Notiz (optional)'} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
      {BELEG_ARTEN.includes(art) && (
        <label className="ab-feld">
          Bestätigung (PDF oder Foto, optional – auch später möglich)
          <input key={dateiFeld} className="feld" type="file" accept="application/pdf,image/*" onChange={(e) => setDatei(e.target.files?.[0] ?? null)} />
        </label>
      )}
      {kosten != null && (
        <p className="klein">
          {ARTEN[art].label}: {p && (art === 'urlaub' || art === 'pflege') ? tage(kosten, stundenJeTag(p)) : `${std(kosten)} an Arbeitstagen`}
          {art === 'urlaub' ? ' werden vom Urlaubskonto abgezogen' : ''}.
          {!ARTEN[art].genehmigung || (d.darfVerwalten && genehmigen) ? '' : ' Muss genehmigt werden.'}
        </p>
      )}
      {d.darfVerwalten && ARTEN[art].genehmigung && (
        <label className="pille-wahl" title="Ohne Haken bleibt der Eintrag offen, bis ihn ein Berechtigter genehmigt">
          <input type="checkbox" checked={genehmigen} onChange={() => setGenehmigen(!genehmigen)} /> gleich genehmigen
        </label>
      )}
      {!p && <p className="klein">Für {email === d.ich.email ? 'dich' : nameVon(d, email)} sind noch keine Stammdaten (Eintritt, Stunden) hinterlegt – das Urlaubskonto erscheint, sobald das Büro sie einträgt.</p>}
      {meldung && <div className={`banner ${meldung.ok ? '' : 'fehler'}`}>{meldung.text}</div>}
      <button className="knopf primaer" disabled={laeuft || !gueltigesDatum(von) || !gueltigesDatum(bisWert) || bisWert < von} onClick={senden}>
        {laeuft ? 'Sende …' : art === 'krank' ? '🤒 Krankmeldung senden' : d.darfVerwalten && genehmigen ? 'Eintragen & genehmigen' : d.darfVerwalten ? 'Eintragen' : 'Beantragen'}
      </button>
    </article>
  );
}

function EintragListe({ d, eintraege, onDaten, mitName }: { d: AbwesenheitDaten; eintraege: Abwesenheit[]; onDaten: (x: AbwesenheitDaten) => void; mitName?: boolean }) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [bearbeiten, setBearbeiten] = useState<Abwesenheit | null>(null);
  const [verlaengern, setVerlaengern] = useState<Abwesenheit | null>(null);
  if (!eintraege.length) return <p className="leer">Keine Einträge</p>;
  const entscheiden = (e: Abwesenheit, status: 'genehmigt' | 'abgelehnt') => {
    const grund = status === 'abgelehnt' ? prompt('Begründung (optional):') ?? undefined : undefined;
    abwesenheitEntscheiden(e.id, status, grund || undefined).then(onDaten).catch((x: Error) => setFehler(x.message));
  };
  return (
    <div className="ab-liste">
      {fehler && <div className="banner fehler">{fehler}</div>}
      {bearbeiten && <EintragBearbeiten d={d} e={bearbeiten} onDaten={onDaten} onSchliessen={() => setBearbeiten(null)} />}
      {verlaengern && <VerlaengernDialog d={d} e={verlaengern} onDaten={onDaten} onSchliessen={() => setVerlaengern(null)} />}
      {eintraege.map((e) => {
        const darf = d.darfVerwalten || (e.email === d.ich.email && e.status === 'beantragt');
        const kannVerl = !e.verdeckt && e.stunden == null && e.status !== 'abgelehnt' && !e.verlaengerung && (d.darfVerwalten || e.email === d.ich.email);
        return (
          <div key={e.id} className={`ab-eintrag glas status-${e.status}`} style={{ borderLeftColor: artInfo(e).farbe }}>
            <div>
              <b>
                {artInfo(e).symbol} {artInfo(e).label}
                {mitName ? ` · ${e.name || nameVon(d, e.email)}` : ''}
              </b>
              <div className="klein">{zeitraumText(e)}</div>
              {e.notiz && <div className="klein">„{e.notiz}“</div>}
              {e.entschieden?.grund && <div className="klein">Begründung: {e.entschieden.grund}</div>}
              {e.verlaengerung && <div className="klein ab-verl">⏳ Verlängerung {e.verlaengerung.offen ? 'bis auf Weiteres' : `bis ${datumKurz(e.verlaengerung.bis)}`} beantragt</div>}
              <BelegLeiste d={d} e={e} onDaten={onDaten} />
            </div>
            <div className="ab-eintrag-rechts">
              <span className={`ab-status ${e.status}`}>{STATUS[e.status]}</span>
              {kannVerl && (
                <button className="knopf klein" onClick={() => setVerlaengern(e)}>
                  {e.offen ? (e.art === 'krank' ? '✓ Gesund gemeldet' : '■ Beenden') : '⟶ Verlängern'}
                </button>
              )}
              {d.darfVerwalten && !e.verdeckt && wartet(e) && (
                <span className="ab-schnell">
                  <button className="knopf primaer klein" title="Genehmigen" onClick={() => entscheiden(e, 'genehmigt')}>✓</button>
                  <button className="knopf klein" title="Ablehnen" onClick={() => entscheiden(e, 'abgelehnt')}>✕</button>
                </span>
              )}
              {d.darfVerwalten && !e.verdeckt && (
                <button className="knopf klein" onClick={() => setBearbeiten(e)}>✎ Bearbeiten</button>
              )}
              {darf && !d.darfVerwalten && (
                <button
                  className="knopf klein"
                  onClick={() => {
                    if (!confirm(e.status === 'beantragt' && e.email === d.ich.email ? 'Antrag zurückziehen?' : 'Eintrag löschen?')) return;
                    abwesenheitLoeschen(e.id).then(onDaten).catch((x: Error) => setFehler(x.message));
                  }}
                >
                  {e.status === 'beantragt' && e.email === d.ich.email ? 'Zurückziehen' : 'Löschen'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Verlängern, „bis auf Weiteres“ oder gesund melden – ohne neuen Antrag. */
function VerlaengernDialog({ d, e, onDaten, onSchliessen }: { d: AbwesenheitDaten; e: Abwesenheit; onDaten: (x: AbwesenheitDaten) => void; onSchliessen: () => void }) {
  const ende = !!e.offen;
  const morgen = datumText(plusTage(ausText(e.bis), 1));
  const [bis, setBis] = useState(ende ? (heute() < e.von ? e.von : heute()) : morgen);
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const mitGenehmigung = !d.darfVerwalten && ARTEN[e.art].genehmigung && e.status === 'genehmigt';
  const min = ende || d.darfVerwalten || e.art === 'krank' ? e.von : morgen;
  const speichern = () => {
    setLaeuft(true);
    setFehler(null);
    abwesenheitVerlaengern(e.id, offen ? { offen: true } : { bis })
      .then((x) => {
        onDaten(x);
        onSchliessen();
      })
      .catch((x: Error) => setFehler(x.message))
      .finally(() => setLaeuft(false));
  };
  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <div className="modal ab-modal" role="dialog" aria-modal="true" onClick={(x) => x.stopPropagation()}>
        <div className="modal-kopf" style={{ background: ARTEN[e.art].farbe }}>
          <div>
            <div className="modal-kategorie">{ende ? (e.art === 'krank' ? 'Gesund melden' : 'Beenden') : 'Verlängern'}</div>
            <h2>{e.name || nameVon(d, e.email)}</h2>
            <div className="modal-nr">
              {ARTEN[e.art].symbol} {ARTEN[e.art].label} · {zeitraumText(e)}
            </div>
          </div>
          <button className="modal-zu" onClick={onSchliessen} aria-label="Schließen">✕</button>
        </div>
        <div className="modal-inhalt ab-formular">
          {!offen && (
            <label className="ab-feld">
              {ende ? (e.art === 'krank' ? 'Letzter Krankheitstag' : 'Letzter Tag') : 'Neues Ende (letzter Tag)'}
              <input className="feld" type="date" value={bis} min={min} onChange={(x) => setBis(x.target.value)} />
            </label>
          )}
          {!ende && OFFEN_ARTEN.includes(e.art) && (
            <label className="pille-wahl">
              <input type="checkbox" checked={offen} onChange={() => setOffen(!offen)} /> bis auf Weiteres ({e.art === 'krank' ? 'bis zur Gesundmeldung' : 'Ende noch offen'})
            </label>
          )}
          {mitGenehmigung && <p className="klein">Die Verlängerung muss genehmigt werden. Der bisherige Zeitraum bleibt genehmigt.</p>}
          {fehler && <div className="banner fehler">{fehler}</div>}
          <div className="aktionen">
            <button className="knopf primaer" disabled={laeuft || (!offen && (!gueltigesDatum(bis) || bis < min))} onClick={speichern}>
              {laeuft ? 'Speichert …' : ende ? 'Speichern' : mitGenehmigung ? 'Verlängerung beantragen' : 'Verlängern'}
            </button>
            <button className="knopf" disabled={laeuft} onClick={onSchliessen}>
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Verwaltung: Eintrag ändern, genehmigen, ablehnen, löschen. */
function EintragBearbeiten({ d, e, onDaten, onSchliessen }: { d: AbwesenheitDaten; e: Abwesenheit; onDaten: (x: AbwesenheitDaten) => void; onSchliessen: () => void }) {
  const [art, setArt] = useState<AbwArt>(e.art);
  const [von, setVon] = useState(e.von);
  const [bis, setBis] = useState(e.bis);
  const [stundenweise, setStundenweise] = useState(e.stunden != null);
  const [stunden, setStunden] = useState(e.stunden ?? 4);
  const [notiz, setNotiz] = useState(e.notiz ?? '');
  const [grund, setGrund] = useState(e.entschieden?.grund ?? '');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const bisWert = stundenweise ? von : bis;
  const ungueltig = !gueltigesDatum(von) || !gueltigesDatum(bisWert) || bisWert < von;
  const speichern = (status?: Abwesenheit['status']) => {
    setLaeuft(true);
    setFehler(null);
    abwesenheitAendern(e.id, {
      art,
      von,
      bis: bisWert,
      stunden: stundenweise ? stunden : null,
      notiz: notiz.trim(),
      ...(status ? { status } : {}),
      ...(grund.trim() ? { grund: grund.trim() } : {}),
    })
      .then((x) => {
        onDaten(x);
        onSchliessen();
      })
      .catch((x: Error) => setFehler(x.message))
      .finally(() => setLaeuft(false));
  };
  const loeschen = () => {
    if (!confirm('Eintrag endgültig löschen?')) return;
    abwesenheitLoeschen(e.id)
      .then((x) => {
        onDaten(x);
        onSchliessen();
      })
      .catch((x: Error) => setFehler(x.message));
  };
  const statusNeu = art === 'krank' ? 'gemeldet' : null;
  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <div className="modal ab-modal" role="dialog" aria-modal="true" onClick={(x) => x.stopPropagation()}>
        <div className="modal-kopf" style={{ background: ARTEN[art].farbe }}>
          <div>
            <div className="modal-kategorie">{STATUS[e.status]}</div>
            <h2>{e.name || nameVon(d, e.email)}</h2>
            <div className="modal-nr">
              {ARTEN[art].symbol} {ARTEN[art].label} · {zeitraumText({ von, bis: bisWert, ...(stundenweise ? { stunden } : {}) })}
            </div>
          </div>
          <button className="modal-zu" onClick={onSchliessen} aria-label="Schließen">✕</button>
        </div>
        <div className="modal-inhalt ab-formular">
          {fehler && <div className="banner fehler">{fehler}</div>}
          <div className="ab-arten">
            {ART_LISTE.map((a) => (
              <button key={a} className={`pille ${art === a ? 'an' : ''}`} style={art === a ? { borderColor: ARTEN[a].farbe } : undefined} onClick={() => setArt(a)}>
                {ARTEN[a].symbol} {ARTEN[a].label}
              </button>
            ))}
          </div>
          <div className="ab-zeile">
            <label className="ab-feld">
              {stundenweise ? 'Tag' : 'Von'}
              <input className="feld" type="date" value={von} onChange={(x) => { setVon(x.target.value); if (x.target.value > bis) setBis(x.target.value); }} />
            </label>
            {stundenweise ? (
              <label className="ab-feld">
                Stunden
                <input className="feld" type="number" min={0.5} max={24} step={0.5} value={stunden} onChange={(x) => setStunden(Number(x.target.value))} />
              </label>
            ) : (
              <label className="ab-feld">
                Bis
                <input className="feld" type="date" value={bis} min={von} onChange={(x) => setBis(x.target.value)} />
              </label>
            )}
          </div>
          <label className="pille-wahl">
            <input type="checkbox" checked={stundenweise} onChange={() => setStundenweise(!stundenweise)} /> Stundenweise (einzelner Tag)
          </label>
          <textarea className="feld" rows={2} placeholder="Notiz" value={notiz} onChange={(x) => setNotiz(x.target.value)} />
          <input className="feld" placeholder="Begründung der Entscheidung (optional)" value={grund} onChange={(x) => setGrund(x.target.value)} />
          <p className="klein">
            Eingetragen von {e.eingetragenVon ? nameVon(d, e.eingetragenVon) : '–'}
            {e.erstellt ? ` am ${format(new Date(e.erstellt), 'dd.MM.yyyy HH:mm')}` : ''}
            {e.entschieden ? ` · ${STATUS[e.status]} von ${nameVon(d, e.entschieden.von)} am ${format(new Date(e.entschieden.am), 'dd.MM.yyyy HH:mm')}` : ''}
            {e.geaendert ? ` · zuletzt geändert von ${nameVon(d, e.geaendert.von)} am ${format(new Date(e.geaendert.am), 'dd.MM.yyyy HH:mm')}` : ''}
          </p>
          <div className="ab-modal-knoepfe">
            {statusNeu ? (
              <button className="knopf primaer" disabled={laeuft || ungueltig} onClick={() => speichern(statusNeu)}>Speichern</button>
            ) : (
              <>
                <button className="knopf primaer" disabled={laeuft || ungueltig} onClick={() => speichern('genehmigt')}>✓ {e.status === 'genehmigt' ? 'Speichern (genehmigt)' : 'Genehmigen'}</button>
                <button className="knopf" disabled={laeuft || ungueltig} onClick={() => speichern('abgelehnt')}>✕ Ablehnen</button>
                {e.status !== 'genehmigt' && e.status !== 'abgelehnt' && (
                  <button className="knopf" disabled={laeuft || ungueltig} onClick={() => speichern(e.status === 'gemeldet' ? 'beantragt' : undefined)}>Speichern (offen)</button>
                )}
              </>
            )}
            <button className="knopf gefahr" onClick={loeschen}>Löschen</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Verwaltung: alle Abwesenheiten mit Filter. */
function AlleEintraege({ d, onDaten }: { d: AbwesenheitDaten; onDaten: (x: AbwesenheitDaten) => void }) {
  const [suche, setSuche] = useState('');
  const [art, setArt] = useState<AbwArt | ''>('');
  const [status, setStatus] = useState<Abwesenheit['status'] | ''>('');
  const [jahr, setJahr] = useState(String(new Date().getFullYear()));
  const jahre = [...new Set(d.eintraege.flatMap((e) => [e.von.slice(0, 4), e.bis.slice(0, 4)]))].sort().reverse();
  const s = suche.trim().toLowerCase();
  const liste = d.eintraege
    .filter((e) => !e.verdeckt)
    .filter((e) => !art || e.art === art)
    .filter((e) => !status || e.status === status)
    .filter((e) => !jahr || e.von.slice(0, 4) === jahr || e.bis.slice(0, 4) === jahr)
    .filter((e) => !s || `${e.name ?? ''} ${nameVon(d, e.email)} ${e.notiz ?? ''}`.toLowerCase().includes(s))
    .sort((a, b) => (wartet(a) ? 0 : 1) - (wartet(b) ? 0 : 1) || b.von.localeCompare(a.von));
  const offen = d.eintraege.filter(wartet).length;
  return (
    <section className="glas admin-block">
      <div className="ab-filter">
        <input className="feld" type="search" placeholder="Name oder Notiz suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <select className="feld" value={art} onChange={(e) => setArt(e.target.value as AbwArt | '')}>
          <option value="">Alle Arten</option>
          {ART_LISTE.map((a) => (
            <option key={a} value={a}>{ARTEN[a].symbol} {ARTEN[a].label}</option>
          ))}
        </select>
        <select className="feld" value={status} onChange={(e) => setStatus(e.target.value as Abwesenheit['status'] | '')}>
          <option value="">Alle Status</option>
          {(Object.keys(STATUS) as Abwesenheit['status'][]).map((x) => (
            <option key={x} value={x}>{STATUS[x]}{x === 'beantragt' && offen ? ` (${offen})` : ''}</option>
          ))}
        </select>
        <select className="feld" value={jahr} onChange={(e) => setJahr(e.target.value)}>
          <option value="">Alle Jahre</option>
          {jahre.map((j) => (
            <option key={j} value={j}>{j}</option>
          ))}
        </select>
      </div>
      <p className="klein">{liste.length} Einträge{offen ? ` · ${offen} offen zur Genehmigung` : ''}</p>
      <EintragListe d={d} eintraege={liste} onDaten={onDaten} mitName />
    </section>
  );
}

function BelegLeiste({ d, e, onDaten }: { d: AbwesenheitDaten; e: Abwesenheit; onDaten: (x: AbwesenheitDaten) => void }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<{ url: string; beleg: Beleg; blob: Blob } | null>(null);
  if (!belegMoeglich(e)) return null;
  const darfHoch = (d.darfVerwalten || e.email === d.ich.email) && e.status !== 'abgelehnt';
  const mitDatei = (b: Beleg, f: (blob: Blob) => void) => {
    setFehler(null);
    belegDatei(e.id, b.id).then(f).catch((x: Error) => setFehler(x.message));
  };
  const hochladen = async (f: File) => {
    setLaeuft(true);
    setFehler(null);
    try {
      const v = await belegVorbereiten(f);
      onDaten(await belegHochladen(e.id, v.datei, v.name));
    } catch (x) {
      setFehler((x as Error).message);
    } finally {
      setLaeuft(false);
    }
  };
  const schliessen = () => {
    if (ansicht) URL.revokeObjectURL(ansicht.url);
    setAnsicht(null);
  };
  return (
    <div className="beleg-leiste">
      {e.belege?.map((b) => (
        <span key={b.id} className="beleg">
          <button className="beleg-name" title={`Ansehen · hochgeladen ${format(b.am, 'd.M.yyyy HH:mm')}`} onClick={() => mitDatei(b, (blob) => setAnsicht({ url: URL.createObjectURL(blob), beleg: b, blob }))}>
            {b.typ === 'application/pdf' ? '📄' : '🖼️'} {b.name}
          </button>
          <button title="Herunterladen" aria-label="Herunterladen" onClick={() => mitDatei(b, (blob) => herunterladen(blob, b.name))}>⬇</button>
          <button title="Drucken" aria-label="Drucken" onClick={() => mitDatei(b, (blob) => drucken(blob, b.typ))}>🖨</button>
          {(d.darfVerwalten || b.von === d.ich.email) && (
            <button
              title="Entfernen"
              aria-label="Entfernen"
              onClick={() => confirm(`„${b.name}“ entfernen?`) && belegEntfernen(e.id, b.id).then(onDaten).catch((x: Error) => setFehler(x.message))}
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {belegFehlt(e) && <span className="ab-status fehlt">Bestätigung fehlt</span>}
      {darfHoch && (
        <label className={`knopf klein beleg-hoch ${laeuft ? 'laeuft' : ''}`}>
          {laeuft ? 'Lädt hoch …' : e.belege?.length ? '📎 Weitere Datei' : '📎 Bestätigung nachreichen'}
          <input
            type="file"
            accept="application/pdf,image/*"
            hidden
            disabled={laeuft}
            onChange={(x) => {
              const f = x.target.files?.[0];
              x.target.value = '';
              if (f) void hochladen(f);
            }}
          />
        </label>
      )}
      {fehler && <span className="klein beleg-fehler">{fehler}</span>}
      {ansicht && (
        <div className="modal-hintergrund" onClick={schliessen}>
          <div className="modal beleg-ansicht" role="dialog" aria-modal="true" onClick={(x) => x.stopPropagation()}>
            <div className="beleg-ansicht-kopf">
              <b>{ansicht.beleg.name}</b>
              <button className="knopf klein" onClick={() => herunterladen(ansicht.blob, ansicht.beleg.name)}>⬇ Herunterladen</button>
              <button className="knopf klein" onClick={() => drucken(ansicht.blob, ansicht.beleg.typ)}>🖨 Drucken</button>
              <button className="knopf klein" onClick={schliessen} aria-label="Schließen">✕</button>
            </div>
            {ansicht.beleg.typ === 'application/pdf' ? <iframe src={ansicht.url} title={ansicht.beleg.name} /> : <img src={ansicht.url} alt={ansicht.beleg.name} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** Archiv der Krankenstands- und Pflegeurlaubsbestätigungen (für Berechtigte). */
function BelegArchiv({ d, onDaten }: { d: AbwesenheitDaten; onDaten: (x: AbwesenheitDaten) => void }) {
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [person, setPerson] = useState('');
  const [nurFehlend, setNurFehlend] = useState(false);
  const alle = d.eintraege.filter((e) => belegMoeglich(e) && e.status !== 'abgelehnt');
  const jahre = [...new Set([new Date().getFullYear(), ...alle.map((e) => Number(e.von.slice(0, 4)))])].sort((a, b) => b - a);
  const personen = [...new Set(alle.map((e) => e.email))].sort((a, b) => nameVon(d, a).localeCompare(nameVon(d, b)));
  const j = String(jahr);
  const l = alle
    .filter((e) => e.von.startsWith(j) || e.bis.startsWith(j))
    .filter((e) => !person || e.email === person)
    .filter((e) => !nurFehlend || belegFehlt(e))
    .reverse();
  const fehlend = alle.filter(belegFehlt).length;
  return (
    <section className="glas admin-block">
      <h3>Bestätigungen: Krankenstand und Pflegeurlaub</h3>
      <div className="ab-zeile beleg-filter">
        <label className="ab-feld">
          Jahr
          <select className="feld" value={jahr} onChange={(e) => setJahr(Number(e.target.value))}>
            {jahre.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="ab-feld">
          Mitarbeiter
          <select className="feld" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Alle</option>
            {personen.map((m) => (
              <option key={m} value={m}>
                {nameVon(d, m)}
              </option>
            ))}
          </select>
        </label>
        <label className="pille-wahl">
          <input type="checkbox" checked={nurFehlend} onChange={() => setNurFehlend(!nurFehlend)} /> nur fehlende ({fehlend})
        </label>
      </div>
      <EintragListe d={d} eintraege={l} onDaten={onDaten} mitName />
    </section>
  );
}

function TeamMonat({ d, onDaten }: { d: AbwesenheitDaten; onDaten: (x: AbwesenheitDaten) => void }) {
  const [monat, setMonat] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [bearbeiten, setBearbeiten] = useState<Abwesenheit | null>(null);
  const [neu, setNeu] = useState<{ email: string; von: string } | null>(null);
  const rahmen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rahmen.current?.querySelector<HTMLElement>('th.heute');
    if (el && rahmen.current) rahmen.current.scrollLeft = Math.max(0, el.offsetLeft - rahmen.current.clientWidth / 2);
  }, [monat]);
  const klick = (email: string, tag: string, e?: Abwesenheit) => {
    if (e && !e.verdeckt && d.darfVerwalten) setBearbeiten(e);
    else if (!e && (d.darfVerwalten || email === d.ich.email)) setNeu({ email, von: tag });
  };
  const tage = tageListe(datumText(monat), datumText(new Date(monat.getFullYear(), monat.getMonth() + 1, 0)));
  const relevant = d.eintraege.filter((e) => e.status !== 'abgelehnt' && e.bis >= tage[0] && e.von <= tage[tage.length - 1]);
  const emails = [...new Set([...d.personal.filter((p) => !p.austritt || p.austritt >= tage[0]).map((p) => p.email), ...relevant.map((e) => e.email)])].filter((m) => !d.externe?.includes(m)).sort((a, b) =>
    nameVon(d, a).localeCompare(nameVon(d, b)),
  );
  const zelle = (email: string, tag: string) => relevant.find((e) => e.email === email && e.von <= tag && e.bis >= tag);
  const frei = (tag: string) => [0, 6].includes(ausText(tag).getDay()) || istFeiertag(tag);
  const anzahl = (tag: string) => emails.filter((m) => {
    const e = zelle(m, tag);
    return e && zaehlt(e);
  }).length;

  return (
    <section className="glas admin-block ab-team">
      <div className="bs-block-kopf ab-team-kopf">
        <button className="knopf" onClick={() => setMonat(new Date(monat.getFullYear(), monat.getMonth() - 1, 1))}>‹</button>
        <h3>{format(monat, 'MMMM yyyy', { locale: de })}</h3>
        <button className="knopf" onClick={() => setMonat(new Date(monat.getFullYear(), monat.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="ab-legende">
        {ART_LISTE.map((a) => (
          <span key={a}>
            <i style={{ background: ARTEN[a].farbe }} /> {ARTEN[a].label}
          </span>
        ))}
        <span><i className="beantragt" /> beantragt</span>
      </div>
      {bearbeiten && <EintragBearbeiten d={d} e={bearbeiten} onDaten={onDaten} onSchliessen={() => setBearbeiten(null)} />}
      {neu && (
        <div className="modal-hintergrund" onClick={() => setNeu(null)}>
          <div className="modal ab-modal ab-modal-neu" role="dialog" aria-modal="true" onClick={(x) => x.stopPropagation()}>
            <button className="modal-zu ab-modal-zu" onClick={() => setNeu(null)} aria-label="Schließen">✕</button>
            <Formular d={d} onDaten={onDaten} start={neu} onFertig={() => setTimeout(() => setNeu(null), 1200)} />
          </div>
        </div>
      )}
      {(d.darfVerwalten || emails.includes(d.ich.email)) && (
        <p className="klein ab-team-tipp">{d.darfVerwalten ? 'Auf ein Feld tippen: freier Tag = neu eintragen, Eintrag = bearbeiten / genehmigen.' : 'Auf einen freien Tag in deiner Zeile tippen, um etwas einzutragen.'}</p>
      )}
      {emails.length === 0 ? (
        <p className="leer">Noch keine Mitarbeiter oder Abwesenheiten</p>
      ) : (
        <div className="bs-block ab-team-rahmen" ref={rahmen}>
          <table className="ab-matrix">
            <thead>
              <tr>
                <th />
                {tage.map((t) => (
                  <th key={t} className={`${frei(t) ? 'frei' : ''} ${t === heute() ? 'heute' : ''}`}>
                    {format(ausText(t), 'EEEEE', { locale: de })}
                    <br />
                    {Number(t.slice(8))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {emails.map((m) => (
                <tr key={m} className={m === d.ich.email ? 'ich' : ''}>
                  <td className="ab-name" title={nameVon(d, m)}>{nameVon(d, m)}</td>
                  {tage.map((t) => {
                    const e = zelle(m, t);
                    return (
                      <td
                        key={t}
                        className={`${frei(t) ? 'frei' : ''} ${e?.status === 'beantragt' ? 'beantragt' : ''} ${(e && !e.verdeckt && d.darfVerwalten) || (!e && (d.darfVerwalten || m === d.ich.email)) ? 'klickbar' : ''}`}
                        onClick={() => klick(m, t, e)}
                        style={e && !frei(t) ? { background: artInfo(e).farbe } : undefined}
                        title={e ? `${nameVon(d, m)}: ${artInfo(e).label} (${STATUS[e.status]})` : undefined}
                      >
                        {e?.stunden ? '½' : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="ab-summe">
                <td>Abwesend</td>
                {tage.map((t) => {
                  const n = frei(t) ? 0 : anzahl(t);
                  return (
                    <td key={t} className={n >= WARN_AB ? 'warn' : ''} title={n >= WARN_AB ? 'Viele Mitarbeiter gleichzeitig abwesend' : undefined}>
                      {n || ''}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Dashboard({ d, onDaten }: { d: AbwesenheitDaten; onDaten: (x: AbwesenheitDaten) => void }) {
  const bs = useBereitschaft(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const t = heute();
  const in7 = datumText(plusTage(new Date(), 7));
  const offen = d.eintraege.filter(wartet);
  const heuteAbw = abwesendAm(d.eintraege, t);
  const woche = d.eintraege.filter((e) => zaehlt(e) && e.bis > t && e.von <= in7);
  const konflikte = (bs.daten?.eintraege ?? [])
    .filter((b) => b.bis > `${t}T00:00`)
    .flatMap((b) => {
      const ende = b.bis.endsWith('T00:00') ? datumText(plusTage(ausText(b.bis.slice(0, 10)), -1)) : b.bis.slice(0, 10);
      return d.eintraege.filter((e) => e.email === b.email && e.status !== 'abgelehnt' && e.von <= ende && e.bis >= b.von.slice(0, 10)).map((e) => ({ b, e }));
    });
  const konten = d.personal
    .filter((p) => (!p.austritt || p.austritt >= t) && !d.externe?.includes(p.email))
    .map((p) => ({ p, k: urlaubskonto(p, d.eintraege, t), krank: krankTageImJahr(p, d.eintraege, new Date().getFullYear()) }))
    .sort((a, b) => a.p.name.localeCompare(b.p.name));
  const entscheiden = (e: Abwesenheit, status: 'genehmigt' | 'abgelehnt') => {
    const grund = status === 'abgelehnt' ? prompt('Begründung (optional):') : '';
    if (grund === null) return;
    abwesenheitEntscheiden(e.id, status, grund || undefined).then(onDaten).catch((x: Error) => setFehler(x.message));
  };

  return (
    <div className="ab-dashboard">
      {fehler && <div className="banner fehler">{fehler}</div>}
      <div className="bs-kacheln ab-kacheln">
        <Kachel label="Heute abwesend" wert={heuteAbw.length} klein={heuteAbw.map((e) => e.name || kurz(e.email)).join(', ')} klasse={heuteAbw.length >= WARN_AB ? 'bs-warn' : ''} />
        <Kachel label="Offene Anträge" wert={offen.length} klasse={offen.length ? 'bs-warn' : 'bs-ok'} />
        <Kachel label="Nächste 7 Tage" wert={woche.length} klein="Abwesenheiten" />
        <Kachel label="Konflikt mit Bereitschaft" wert={konflikte.length} klasse={konflikte.length ? 'bs-warn' : 'bs-ok'} />
      </div>
      <div className="bs-spalten">
        <section className="glas admin-block">
          <h3>Offene Anträge</h3>
          {offen.length === 0 && <p className="leer">Alles erledigt ✓</p>}
          {offen.map((e) => {
            const p = d.personal.find((x) => x.email === e.email);
            const k = p ? urlaubskonto(p, d.eintraege, t) : null;
            return (
              <div key={e.id} className="ab-eintrag glas" style={{ borderLeftColor: ARTEN[e.art].farbe }}>
                <div>
                  <b>
                    {ARTEN[e.art].symbol} {e.name || nameVon(d, e.email)} · {ARTEN[e.art].label}
                    {e.verlaengerung ? ' · Verlängerung' : ''}
                  </b>
                  <div className="klein">
                    {e.verlaengerung && `bisher ${zeitraumText(e)} → ${e.verlaengerung.offen ? 'bis auf Weiteres' : `neu bis ${datumKurz(e.verlaengerung.bis)}`} · `}
                    {!e.verlaengerung && zeitraumText(e)}
                    {p ? ` · ${e.art === 'urlaub' || e.art === 'pflege' ? tage(stundenVon(p, e), stundenJeTag(p)) : std(stundenVon(p, e))}` : ''}
                    {k && e.art === 'urlaub' ? ` · Rest ${tage(k.restGeplant, k.stundenProTag)}` : ''}
                  </div>
                  {e.notiz && <div className="klein">„{e.notiz}“</div>}
                </div>
                <div className="ab-eintrag-rechts">
                  <button className="knopf primaer klein" onClick={() => entscheiden(e, 'genehmigt')}>Genehmigen</button>
                  <button className="knopf klein" onClick={() => entscheiden(e, 'abgelehnt')}>Ablehnen</button>
                </div>
              </div>
            );
          })}
          {konflikte.length > 0 && (
            <>
              <h3>Konflikte mit der Bereitschaft</h3>
              {konflikte.map(({ b, e }) => (
                <div key={b.id + e.id} className="klein ab-konflikt">
                  ⚠ {e.name || nameVon(d, e.email)}: {artInfo(e).label} {zeitraumText(e)} – eingeteilt zur Bereitschaft {b.von.slice(0, 10).split('-').reverse().join('.')}
                </div>
              ))}
            </>
          )}
        </section>
        <section className="glas admin-block bs-block">
          <h3>Heute & nächste 7 Tage</h3>
          <EintragListe d={d} eintraege={woche} onDaten={onDaten} mitName />
        </section>
      </div>
      <section className="glas admin-block bs-block">
        <h3>Urlaubskonten</h3>
        {konten.length === 0 ? (
          <p className="leer">Noch keine Stammdaten – unter „Personal“ anlegen oder importieren.</p>
        ) : (
          <table className="bs-tabelle">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Resturlaub</th>
                <th>Verplant</th>
                <th>Verfällt bald</th>
                <th>Krank {new Date().getFullYear()}</th>
              </tr>
            </thead>
            <tbody>
              {konten.map(({ p, k, krank }) => (
                <tr key={p.email}>
                  <td>{p.name}</td>
                  <td className={k.restGeplant < 0 ? 'ab-rot' : ''}>
                    {tage(k.restGeplant, k.stundenProTag)}
                    <div className="klein">{restUnter(k)}</div>
                  </td>
                  <td>{tage(k.verplant, k.stundenProTag)}</td>
                  <td className={!p.ohneVerfall && k.verfaelltBald > 0 ? 'ab-rot' : ''}>{p.ohneVerfall ? '–' : tage(k.verfaelltBald, k.stundenProTag)}</td>
                  <td>{krank} Tage</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}


/** Konto-Auswahl: Mitarbeiter aus dem Hub (auch PIN-Konten ohne E-Mail), intern ohne E-Mail oder andere Adresse. */
function KontoWahl({ wert, personen, leer, neu, onWahl }: { wert: string; personen: { email: string; name?: string }[]; leer: string; neu: () => string; onWahl: (email: string) => void }) {
  const bekannt = personen.some((p) => p.email === wert);
  return (
    <select
      className="feld"
      value={wert}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '__neu') onWahl(neu());
        else if (v === '__andere') {
          const x = prompt('E-Mail-Adresse (Google-Konto)')?.trim().toLowerCase();
          if (x?.includes('@')) onWahl(x);
        } else onWahl(v);
      }}
    >
      <option value="">{leer}</option>
      {wert && !bekannt && <option value={wert}>{istOhneEmail(wert) ? 'ohne E-Mail (nur hier)' : wert}</option>}
      {personen.map((p) => (
        <option key={p.email} value={p.email}>
          {p.name ?? p.email} · {istOhneEmail(p.email) ? 'ohne E-Mail (PIN)' : p.email}
        </option>
      ))}
      <option value="__neu">＋ ohne E-Mail anlegen</option>
      <option value="__andere">＋ andere E-Mail …</option>
    </select>
  );
}

type Zeitraum = { von: string; bis: string };
const ZEITRAEUME: [string, string][] = [
  ['jahr', 'Dieses Jahr'],
  ['vorjahr', 'Vorjahr'],
  ['12m', '12 Monate'],
  ['alles', 'Alles'],
];
function zeitraumVorlage(x: string, p: Personal): Zeitraum {
  const h = heute();
  const j = +h.slice(0, 4);
  if (x === 'vorjahr') return { von: `${j - 1}-01-01`, bis: `${j - 1}-12-31` };
  if (x === '12m') return { von: datumText(plusTage(ausText(h), -365)), bis: h };
  if (x === 'alles') return { von: gueltigesDatum(p.eintritt) ? p.eintritt : '2000-01-01', bis: p.austritt && gueltigesDatum(p.austritt) ? p.austritt : `${j}-12-31` };
  return { von: `${j}-01-01`, bis: `${j}-12-31` };
}
const endeVon = (e: Abwesenheit) => (e.offen || !gueltigesDatum(e.bis) ? heute() : e.bis);

/** Volle Personalakte: Konto, Abwesenheiten und Zeitkonto einer Person im gewählten Zeitraum. */
/** Admin: Stammdaten, Telefon und Korrektur von Ü-Übertrag/Saldo und Resturlaub ab Stichtag. */
function AkteKorrektur({ d, p, onDaten }: { d: AbwesenheitDaten; p: Personal; onDaten: (x: AbwesenheitDaten) => void }) {
  const [x, setX] = useState<Personal | null>(null);
  const [fehler, setFehler] = useState('');
  if (!x)
    return (
      <button type="button" className="knopf klein" onClick={() => setX({ ...p })}>
        ✎ Stammdaten / Korrektur
      </button>
    );
  const zahlFeld = (k: 'urlaubStartSaldo' | 'ueStartSaldo' | 'vordienstjahre' | 'urlaubswochen', label: string, schritt = 0.25) => (
    <label>
      {label}
      <input className="feld" type="number" step={schritt} value={x[k] ?? ''} onChange={(e) => setX({ ...x, [k]: e.target.value === '' ? undefined : Number(e.target.value) })} />
    </label>
  );
  return (
    <div className="glas admin-block ab-formular">
      <h3>Stammdaten / Korrektur</h3>
      <div className="formular-reihe">
        <label>
          Telefon (Direktwahl)
          <input className="feld" type="tel" inputMode="tel" placeholder="+43 …" value={x.telefon ?? ''} onChange={(e) => setX({ ...x, telefon: e.target.value || undefined })} />
        </label>
        <label>
          Eintritt
          <input className="feld" type="date" value={x.eintritt} onChange={(e) => setX({ ...x, eintritt: e.target.value })} />
        </label>
        {zahlFeld('vordienstjahre', 'Vordienstjahre', 1)}
        {zahlFeld('urlaubswochen', 'Urlaubswochen (leer = gesetzlich 5/6)', 1)}
      </div>
      <div className="formular-reihe">
        <label>
          Stichtag Resturlaub
          <input className="feld" type="date" value={x.saldoAb ?? ''} onChange={(e) => setX({ ...x, saldoAb: e.target.value || undefined })} />
        </label>
        {zahlFeld('urlaubStartSaldo', 'Resturlaub am Stichtag (Stunden)')}
        <label>
          Ü-Übertrag gilt ab Monat
          <input className="feld" type="month" value={x.ueAbMonat ?? ''} onChange={(e) => setX({ ...x, ueAbMonat: e.target.value || undefined })} />
        </label>
        {zahlFeld('ueStartSaldo', 'Ü-Übertrag / Saldo (Stunden)')}
      </div>
      <p className="klein">Resturlaub: ab dem Stichtag zählt nur dieser Wert plus neue Ansprüche nach UrlG (Wochenstunden × 5 bzw. 6 Wochen, Urlaubsjahr ab Eintritt). Ü-Übertrag: Saldo zu Beginn des gewählten Monats; ab diesem Monat wird weitergerechnet.</p>
      {fehler && <div className="banner fehler">{fehler}</div>}
      <div className="ab-modal-knoepfe">
        <button
          type="button"
          className="knopf primaer"
          onClick={() =>
            void personalSpeichern(d.personal.map((y) => (y.email === p.email ? x : y)))
              .then((n) => {
                onDaten(n);
                setX(null);
              })
              .catch((e: Error) => setFehler(e.message))
          }
        >
          Speichern
        </button>
        <button type="button" className="knopf" onClick={() => setX(null)}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function PersonalAkte({ d, p, onDaten, schliessen }: { d: AbwesenheitDaten; p: Personal; onDaten: (x: AbwesenheitDaten) => void; schliessen: () => void }) {
  const [z, setZ] = useState<Zeitraum>(() => zeitraumVorlage('jahr', p));
  const [zk, setZk] = useState<ZeitkontoDaten | null>(null);
  useEffect(() => {
    zeitkontoLaden()
      .then(setZk)
      .catch(() => undefined);
  }, []);
  const ok = gueltigesDatum(z.von) && gueltigesDatum(z.bis) && z.von <= z.bis;
  const eintraege = useMemo(
    () => (ok ? d.eintraege.filter((e) => e.email === p.email && e.von <= z.bis && endeVon(e) >= z.von).sort((a, b) => b.von.localeCompare(a.von)) : []),
    [d.eintraege, p.email, z, ok],
  );
  const summen = useMemo(
    () =>
      ART_LISTE.map((art) => {
        let h = 0;
        for (const e of eintraege) {
          if (e.art !== art || !zaehlt(e)) continue;
          const von = e.von < z.von ? z.von : e.von;
          const bis = endeVon(e) > z.bis ? z.bis : endeVon(e);
          if (von <= bis) for (const t of tageListe(von, bis)) h += e.stunden != null ? Math.min(e.stunden, sollStunden(p, t)) : sollStunden(p, t);
        }
        return { art, h };
      }).filter((x) => x.h > 0),
    [eintraege, z, p],
  );
  const monate = useMemo(() => {
    if (!zk || !ok) return [];
    const l: BerichtZeile[] = [];
    const von = [z.von.slice(0, 7), (p.eintritt || '2000-01').slice(0, 7)].sort()[1];
    for (let m = [z.bis.slice(0, 7), heute().slice(0, 7)].sort()[0]; m >= von && l.length < 240; m = monatPlus(m, -1)) l.push(berichtZeile(p, d.eintraege, zk, m));
    return l;
  }, [zk, ok, z, p, d.eintraege]);
  const summe = (k: 'neu' | 'ausbezahlt' | 'kr' | 'ur' | 'so') => zahlText(monate.reduce((a, m) => a + m[k], 0));
  const proTag = stundenJeTag(p);
  return (
    <div className="modal-hintergrund" onClick={schliessen}>
      <div className="modal ab-modal ab-akte" role="dialog" aria-modal="true" onClick={(x) => x.stopPropagation()}>
        <div className="modal-kopf">
          <div>
            <div className="modal-kategorie">Personalakte</div>
            <h2>{p.name || p.email}</h2>
            <div className="modal-nr">
              {[p.gruppe, istOhneEmail(p.email) ? 'ohne E-Mail' : p.email, p.eintritt && `seit ${datum(p.eintritt, 'dd.MM.yyyy')}`, `${std(p.tage.reduce((a, b) => a + b, 0))}/Woche`, p.austritt && `Austritt ${datum(p.austritt, 'dd.MM.yyyy')}`]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <button className="modal-zu" onClick={schliessen} aria-label="Schließen">✕</button>
        </div>
        <div className="modal-inhalt">
          {gueltigesDatum(p.eintritt) && <KontoKacheln p={p} eintraege={d.eintraege} />}
          <div className="ab-akte-filter">
            {ZEITRAEUME.map(([x, l]) => (
              <button key={x} className="knopf klein" onClick={() => setZ(zeitraumVorlage(x, p))}>
                {l}
              </button>
            ))}
            <label>
              von <input className="feld" type="date" value={z.von} onChange={(e) => setZ({ ...z, von: e.target.value })} />
            </label>
            <label>
              bis <input className="feld" type="date" value={z.bis} onChange={(e) => setZ({ ...z, bis: e.target.value })} />
            </label>
          </div>
          <h3>Abwesenheiten im Zeitraum</h3>
          <div className="ab-akte-summen">
            {summen.length ? (
              summen.map(({ art, h }) => (
                <span key={art} style={{ borderColor: ARTEN[art].farbe }}>
                  {ARTEN[art].symbol} {ARTEN[art].label} <b>{art === 'za' ? std(h) : tage(h, proTag)}</b>
                </span>
              ))
            ) : (
              <span className="klein">Keine</span>
            )}
          </div>
          <h3>Stunden / Zeitkonto</h3>
          {!zk ? (
            <p className="klein">Lädt …</p>
          ) : monate.length ? (
            <div className="ab-akte-tabelle">
              <table>
                <thead>
                  <tr>
                    <th>Monat</th>
                    <th>Ü-Übertrag</th>
                    <th>Ü-Neu</th>
                    <th>Ü-Ausz.</th>
                    <th>Ü-Saldo</th>
                    <th>Kr.</th>
                    <th>Ur.</th>
                    <th>So.</th>
                  </tr>
                </thead>
                <tbody>
                  {monate.map((m) => (
                    <tr key={m.monat} className={m.abgeschlossen ? '' : 'offen'} title={m.abgeschlossen ? 'abgeschlossen' : 'noch nicht abgeschlossen'}>
                      <td>
                        {monatText(m.monat)}
                        {m.abgeschlossen ? '' : ' ·'}
                      </td>
                      <td>{zahlText(m.uebertrag)}</td>
                      <td>{zahlText(m.neu)}</td>
                      <td>{zahlText(m.ausbezahlt)}</td>
                      <td>
                        <b>{zahlText(m.saldo)}</b>
                      </td>
                      <td>{zahlText(m.kr)}</td>
                      <td>{zahlText(m.ur)}</td>
                      <td>{zahlText(m.so)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Summe</th>
                    <th />
                    <th>{summe('neu')}</th>
                    <th>{summe('ausbezahlt')}</th>
                    <th>{zahlText(monate[0].saldo)}</th>
                    <th>{summe('kr')}</th>
                    <th>{summe('ur')}</th>
                    <th>{summe('so')}</th>
                  </tr>
                </tfoot>
              </table>
              <p className="klein">· = Monat noch nicht abgeschlossen. Kr./Ur./So. in Tagen laut Monatsbericht.</p>
            </div>
          ) : (
            <p className="klein">Keine Monate im Zeitraum</p>
          )}
          {d.darfVerwalten && <AkteKorrektur d={d} p={p} onDaten={onDaten} />}
          <h3>Alle Einträge ({eintraege.length})</h3>
          <EintragListe d={d} eintraege={eintraege} onDaten={onDaten} />
        </div>
      </div>
    </div>
  );
}

type AltVorschau =
  | { typ: 'excel'; jahr: number; personen: { name: string; email: string; abw: ImportAbwesenheit[]; tage: { datum: string; code: string }[] }[] }
  | { typ: 'pdf'; monat: string; personen: (ImportBerichtZeile & { email: string })[] };

/** Alte Einträge aus dem Excel-Abwesenheitsplaner (Abwesenheiten) und aus Monatsberichts-PDFs (Zeitkonto) übernehmen. */
function AltImport({ d, onDaten }: { d: AbwesenheitDaten; onDaten: (x: AbwesenheitDaten) => void }) {
  const [v, setV] = useState<AltVorschau | null>(null);
  const [zk, setZk] = useState<ZeitkontoDaten | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const personal = useMemo(() => [...d.personal].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)), [d.personal]);
  const abwFuer = (tage: { datum: string; code: string }[], email: string) => tageZuAbwesenheiten(tage, d.personal.find((x) => x.email === email));
  const lesen = async (f: File) => {
    setMeldung(null);
    setV(null);
    setLaeuft(true);
    try {
      if (/\.pdf$/i.test(f.name)) {
        const b = berichtLesen(await pdfZeilen(f));
        if (!b.monat || !b.zeilen.length) throw new Error('Im PDF wurde kein Monatsbericht erkannt.');
        setZk(await zeitkontoLaden());
        setV({ typ: 'pdf', monat: b.monat, personen: b.zeilen.map((z) => ({ ...z, email: nameZuordnen(z.name, d.personal) })) });
      } else {
        const x = await excelLesen(f);
        setV({
          typ: 'excel',
          jahr: x.jahr,
          personen: x.personen.map((p) => {
            const email = nameZuordnen(p.name, d.personal);
            return { ...p, email, abw: abwFuer(p.tage, email) };
          }),
        });
      }
    } catch (e) {
      setMeldung({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLaeuft(false);
    }
  };
  const zuordnen = (i: number, email: string) =>
    setV((x) =>
      !x
        ? x
        : x.typ === 'excel'
          ? { ...x, personen: x.personen.map((p, j) => (j === i ? { ...p, email, abw: abwFuer(p.tage, email) } : p)) }
          : { ...x, personen: x.personen.map((p, j) => (j === i ? { ...p, email } : p)) },
    );
  const uebernehmen = async () => {
    if (!v) return;
    setLaeuft(true);
    setMeldung(null);
    try {
      if (v.typ === 'excel') {
        const abwesenheiten = v.personen.flatMap((p) => (p.email ? p.abw.map((a) => ({ email: p.email, ...a })) : []));
        const neu = await altdatenImportieren({ personal: [], abwesenheiten });
        onDaten(neu);
        const n = neu.eintraege.length - d.eintraege.length;
        setMeldung({ ok: true, text: `${n} Abwesenheiten in den Kalender übernommen${abwesenheiten.length > n ? `, ${abwesenheiten.length - n} waren schon vorhanden` : ''}.` });
      } else if (zk) {
        const eintraege = v.personen.flatMap((z) => {
          const p = d.personal.find((x) => x.email === z.email);
          if (!p) return [];
          const k = kalenderTage(p, d.eintraege, monatPlus(v.monat, zk.einstellungen.verschiebungAbw));
          return [{ email: p.email, monat: v.monat, ue: z.ue, ueAusb: z.ueAusb, kr: runden(z.kr - k.kr), ur: runden(z.ur - k.ur), so: runden(z.so - k.so) }];
        });
        setZk(await zeitkontoSpeichern(eintraege));
        setMeldung({ ok: true, text: `Monatsbericht ${monatText(v.monat)} für ${eintraege.length} Mitarbeiter als abgeschlossen übernommen.` });
      }
      setV(null);
    } catch (e) {
      setMeldung({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLaeuft(false);
    }
  };
  const wahl = (email: string, i: number) => (
    <select className="feld" value={email} onChange={(e) => zuordnen(i, e.target.value)}>
      <option value="">– nicht übernehmen –</option>
      {personal.map((p) => (
        <option key={p.email} value={p.email}>
          {p.name || p.email}
        </option>
      ))}
    </select>
  );
  const anzahl = !v ? 0 : v.typ === 'excel' ? v.personen.reduce((a, p) => a + (p.email ? p.abw.length : 0), 0) : v.personen.filter((p) => p.email).length;
  return (
    <section className="glas admin-block bs-block">
      <h3>Alte Einträge aus Excel / PDF</h3>
      <p className="klein">
        <b>Excel</b> (An-/Abwesenheitsplaner, .xlsm/.xlsx): Urlaub, Krankenstand, Sonderurlaub, freie Tage, Fortbildung usw. werden als Abwesenheiten in den Kalender übertragen. <b>PDF</b> (Monatsbericht): Überstunden und Kr./Ur./So.-Tage werden als abgeschlossener Monat ins Zeitkonto übernommen. Schon vorhandene Einträge werden nicht doppelt angelegt. <b>Reihenfolge:</b> zuerst das Excel, danach die PDFs – das PDF speichert nur die Abweichung zum Kalender; später importierte Abwesenheiten würden sonst doppelt zählen.
      </p>
      <input type="file" accept=".xlsm,.xlsx,.pdf" disabled={laeuft} onChange={(e) => e.target.files?.[0] && void lesen(e.target.files[0])} />
      {laeuft && <p className="klein">Lese …</p>}
      {v && (
        <>
          <p className="klein">
            {v.typ === 'excel' ? (
              `Abwesenheitsplaner ${v.jahr}: ${v.personen.length} Mitarbeiter erkannt.`
            ) : (
              <>
                Monatsbericht für{' '}
                <input className="feld" type="month" value={v.monat} onChange={(e) => gueltigerMonat(e.target.value) && setV({ ...v, monat: e.target.value })} /> – {v.personen.length} Zeilen. Werte gelten als
                Monatsbericht; die Abweichung zum Kalender wird als Korrektur gespeichert.
              </>
            )}
          </p>
          <div className="ab-akte-tabelle">
            <table>
              <thead>
                <tr>
                  <th>Name (alt)</th>
                  <th>Mitarbeiter</th>
                  {v.typ === 'excel' ? (
                    <th>Abwesenheiten</th>
                  ) : (
                    <>
                      <th>Ü-Std</th>
                      <th>Kr.</th>
                      <th>Ur.</th>
                      <th>So.</th>
                      <th />
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {v.typ === 'excel'
                  ? v.personen.map((p, i) => (
                      <tr key={i}>
                        <td>{p.name}</td>
                        <td>{wahl(p.email, i)}</td>
                        <td title={p.abw.map((a) => `${ARTEN[a.art].label} ${a.von === a.bis ? a.von : `${a.von} – ${a.bis}`}${a.stunden ? ` (${a.stunden} h)` : ''}`).join('\n')}>
                          {ART_LISTE.map((art) => [art, p.abw.filter((a) => a.art === art).length] as const)
                            .filter(([, n]) => n)
                            .map(([art, n]) => `${ARTEN[art].symbol} ${n}`)
                            .join('  ') || '–'}
                        </td>
                      </tr>
                    ))
                  : v.personen.map((p, i) => (
                      <tr key={i}>
                        <td>
                          {p.name}
                          {p.gruppe && <span className="klein"> · {p.gruppe}</span>}
                        </td>
                        <td>{wahl(p.email, i)}</td>
                        <td>{zahlText(p.ue)}</td>
                        <td>{zahlText(p.kr)}</td>
                        <td>{zahlText(p.ur)}</td>
                        <td>{zahlText(p.so)}</td>
                        <td className="klein">{zk?.eintraege.some((e) => e.email === p.email && e.monat === v.monat) ? 'ersetzt Abschluss' : ''}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          <div className="ab-knoepfe">
            <button className="knopf primaer" disabled={laeuft || !anzahl} onClick={() => void uebernehmen()}>
              {v.typ === 'excel' ? `${anzahl} Abwesenheiten übernehmen` : `${anzahl} Mitarbeiter übernehmen`}
            </button>
            <button className="knopf" onClick={() => setV(null)}>
              Abbrechen
            </button>
          </div>
        </>
      )}
      {meldung && <div className={`banner ${meldung.ok ? 'ok' : 'fehler'}`}>{meldung.text}</div>}
    </section>
  );
}

function PersonalVerwaltung({ d, onDaten }: { d: AbwesenheitDaten; onDaten: (x: AbwesenheitDaten) => void }) {
  const liste = d.personal;
  const [imp, setImp] = useState<{ alt: AltMitarbeiter[]; zuordnung: Record<string, string>; roh: unknown } | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [akte, setAkte] = useState<Personal | null>(null);
  const fehlend = d.personen.filter((p) => !liste.some((x) => x.email === p.email));
  const fertig = (x: AbwesenheitDaten, text: string) => {
    onDaten(x);
    setMeldung({ ok: true, text });
  };

  const dateiLesen = (f: File) =>
    f.text().then((t) => {
      try {
        const roh: unknown = JSON.parse(t);
        const alt = altdatenLesen(roh, heute());
        const zuordnung: Record<string, string> = {};
        for (const a of alt) {
          const treffer = d.personen.find((p) => p.name && p.name.toLowerCase() === a.name.toLowerCase()) ?? liste.find((p) => p.name.toLowerCase() === a.name.toLowerCase());
          zuordnung[a.mId] = treffer ? treffer.email : internesKonto(a.name, a.mId);
        }
        setImp({ alt, zuordnung, roh });
        setMeldung(null);
      } catch {
        setMeldung({ ok: false, text: 'Die Datei ist keine gültige personal_daten.json.' });
      }
    });

  const importieren = () => {
    if (!imp) return;
    const z = imp.zuordnung;
    const gewaehlt = imp.alt.filter((a) => z[a.mId]);
    altdatenImportieren({
      personal: gewaehlt.map((a) => ({ ...a.personal, email: z[a.mId] })),
      abwesenheiten: gewaehlt.flatMap((a) => a.abwesenheiten.map((x) => ({ ...x, email: z[a.mId] }))),
    })
      .then(async (x) => {
        const monate = altEintraegeLesen(imp.roh);
        const eintraege = gewaehlt.flatMap((a) => (monate.get(a.mId) ?? []).map((e) => ({ ...e, email: z[a.mId] })));
        if (eintraege.length) await zeitkontoSpeichern(eintraege);
        setImp(null);
        fertig(x, `${gewaehlt.length} Mitarbeiter importiert${eintraege.length ? `, ${eintraege.length} Monatsabschlüsse übernommen` : ''}.`);
      })
      .catch((e: Error) => setMeldung({ ok: false, text: e.message }));
  };

  return (
    <div className="ab-personal">
      {meldung && <div className={`banner ${meldung.ok ? '' : 'fehler'}`}>{meldung.text}</div>}
      <section className="glas admin-block bs-block">
        <h3>Personal-Stammdaten</h3>
        <p className="klein">
          Urlaubsanspruch nach Urlaubsgesetz: 5 Wochen je Arbeitsjahr ab Eintritt (ab 25 Dienstjahren inkl. Vordienstzeiten 6), im ersten halben Jahr aliquot, Verfall 2 Jahre nach Ende des Urlaubsjahres – pro Mitarbeiter abschaltbar („verfällt nach Gesetz“; beim Import aus dem alten Programm aus). Angezeigt in Arbeitstagen (bei Teilzeit umgerechnet mit den durchschnittlichen Stunden je Arbeitstag laut Wochenplan).
        </p>
        <div className="banner">
          Stammdaten pflegst du zentral im Hub: <b>Apps &amp; Rechte → Mitarbeiter → „👤 Personal“</b>. Dort stehen Konto, Gruppen, Rollen, Rechte und Personaldaten zusammen.
          {fehlend.length > 0 && ` ${fehlend.length} Mitarbeiter haben noch keine Personaldaten.`}
        </div>
        <div className="ab-stamm-liste">
          {liste.map((p) => {
            const k = p.eintritt ? urlaubskonto(p, d.eintraege, heute()) : null;
            const wochenStd = p.tage.reduce((x, y) => x + y, 0);
            return (
              <div
                key={p.email}
                className={`ab-stamm-karte glas ${p.austritt && p.austritt < heute() ? 'aus' : ''}`}
                role="button"
                tabIndex={0}
                title="Personalakte öffnen"
                onClick={() => setAkte(p)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setAkte(p))}
              >
                <b>{p.name || 'Ohne Namen'}</b>
                <span className="klein">{istOhneEmail(p.email) ? 'ohne E-Mail' : p.email || 'kein Konto'}</span>
                <span className="ab-stamm-werte">
                  <span>seit {p.eintritt ? datum(p.eintritt, 'dd.MM.yyyy') : '–'}</span>
                  <span>{std(wochenStd)}/Woche</span>
                  {k && <span className={k.restGeplant < 0 ? 'ab-rot' : ''}>Rest {tage(k.restGeplant, k.stundenProTag)}</span>}
                  {!p.ohneVerfall && <span>verfällt nach Gesetz</span>}
                  {p.austritt && <span>Austritt {datum(p.austritt, 'dd.MM.yyyy')}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {akte && <PersonalAkte d={d} p={d.personal.find((x) => x.email === akte.email) ?? akte} onDaten={onDaten} schliessen={() => setAkte(null)} />}
      <AltImport d={d} onDaten={onDaten} />
      <section className="glas admin-block bs-block">
        <h3>Import aus dem bisherigen Programm</h3>
        <p className="klein">
          <code>personal_daten.json</code> auswählen. Mitarbeiter werden per Name dem Hub zugeordnet, sonst ohne E-Mail angelegt (später unter „Konto“ zuordenbar). Übernommen werden Mitarbeiter (Eintritt, Austritt, Sollstunden, Gruppe, Überstunden-Startsaldo), alle Abwesenheiten aus dem Kalender und der heutige Resturlaub als Startsaldo.
        </p>
        <input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && dateiLesen(e.target.files[0])} />
        {imp && (
          <>
            <table className="bs-tabelle">
              <thead>
                <tr>
                  <th>Alt</th>
                  <th>Konto</th>
                  <th>Abwesenheiten</th>
                  <th>Resturlaub alt</th>
                </tr>
              </thead>
              <tbody>
                {imp.alt.map((a) => (
                  <tr key={a.mId}>
                    <td>{a.name}</td>
                    <td>
                      <KontoWahl
                        wert={imp.zuordnung[a.mId] ?? ''}
                        personen={d.personen}
                        leer="nicht importieren"
                        neu={() => internesKonto(a.name, a.mId)}
                        onWahl={(email) => setImp({ ...imp, zuordnung: { ...imp.zuordnung, [a.mId]: email } })}
                      />
                    </td>
                    <td>{a.abwesenheiten.length}</td>
                    <td>{a.altRestTage} Tage</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="knopf primaer" disabled={!Object.values(imp.zuordnung).some((x) => x.includes('@'))} onClick={importieren}>
              Importieren
            </button>
          </>
        )}
      </section>
    </div>
  );
}

type Modus = 'meine' | 'team' | 'alle' | 'dashboard' | 'belege' | 'zeitkonto' | 'personal';
const LS_MODUS = 'alamida.abwesenheitModus';

export default function AbwesenheitAnsicht({ aktiv }: { aktiv: boolean }) {
  const { daten, setDaten, fehler } = useAbwesenheit(aktiv);
  const [modus, setModusRoh] = useState<Modus>(() => (localStorage.getItem(LS_MODUS) as Modus) || 'meine');
  const setModus = (m: Modus) => {
    setModusRoh(m);
    localStorage.setItem(LS_MODUS, m);
  };
  if (!aktiv) return <p className="leer">Für Urlaub / Krank brauchst du eine Freigabe.</p>;
  if (!daten) return fehler ? <div className="banner fehler">{fehler}</div> : <p className="leer">Lädt …</p>;
  const modi: [Modus, string][] = [
    ['meine', '🙋 Meine'],
    ['team', '▦ Team'],
    ...(daten.darfVerwalten ? ([['alle', '📋 Alle Einträge'], ['dashboard', '◔ Dashboard'], ['belege', '🗂 Belege'], ['zeitkonto', '⏱ Zeitkonten'], ['personal', '👥 Personal']] as [Modus, string][]) : []),
  ];
  const m = modi.some(([x]) => x === modus) ? modus : 'meine';
  const ich = daten.personal.find((p) => p.email === daten.ich.email);
  const meine = daten.eintraege.filter((e) => e.email === daten.ich.email).reverse();

  return (
    <section className="bereitschaft abwesenheit">
      <div className="bereitschaft-kopf tag-kopf">
        <div>
          <h2>Urlaub / Krank</h2>
          <p className="klein">{daten.darfVerwalten ? 'Du siehst und genehmigst alle Abwesenheiten.' : 'Urlaub beantragen, krank melden, Resturlaub im Blick.'}</p>
        </div>
        <div className="tag-nav-knoepfe bs-umschalter" role="tablist">
          {modi.map(([x, label]) => (
            <button key={x} role="tab" aria-selected={m === x} className={m === x ? 'aktiv' : ''} onClick={() => setModus(x)}>
              {label}
              {x === 'dashboard' && daten.eintraege.some(wartet) ? ' •' : ''}
              {x === 'belege' && daten.eintraege.some(belegFehlt) ? ' •' : ''}
            </button>
          ))}
        </div>
      </div>
      {fehler && <div className="banner fehler">{fehler}</div>}
      {m === 'meine' && (
        <>
          {ich && <KontoKacheln p={ich} eintraege={daten.eintraege} />}
          <div className="bs-spalten">
            <Formular d={daten} onDaten={setDaten} />
            <section className="glas admin-block">
              <h3>Meine Einträge</h3>
              <EintragListe d={daten} eintraege={meine} onDaten={setDaten} />
            </section>
          </div>
        </>
      )}
      {m === 'team' && <TeamMonat d={daten} onDaten={setDaten} />}
      {m === 'alle' && <AlleEintraege d={daten} onDaten={setDaten} />}
      {m === 'dashboard' && <Dashboard d={daten} onDaten={setDaten} />}
      {m === 'belege' && <BelegArchiv d={daten} onDaten={setDaten} />}
      {m === 'zeitkonto' && <ZeitkontoAnsicht d={daten} onDaten={setDaten} />}
      {m === 'personal' && <PersonalVerwaltung d={daten} onDaten={setDaten} />}
    </section>
  );
}
