import { useCallback, useEffect, useMemo, useState } from 'react';
import { standText } from './offlineCache';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  abwesenheitEintragen,
  abwesenheitEntscheiden,
  abwesenheitLaden,
  abwesenheitLoeschen,
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
  STANDARD_TAGE,
  altdatenLesen,
  arbeitstage,
  istFeiertag,
  stundenVon,
  tageListe,
  urlaubskonto,
  zaehlt,
  type AbwArt,
  type Abwesenheit,
  type AltMitarbeiter,
  type Personal,
  type Beleg,
  BELEG_ARTEN,
  belegFehlt,
  belegMoeglich, internesKonto, istOhneEmail, stundenJeTag, tageAnzeige } from '../shared/abwesenheit';
import { ausText, datumText, plusTage } from '../shared/bereitschaft';
import { useBereitschaft } from './BereitschaftAnsicht';
import { belegVorbereiten, drucken, herunterladen } from './beleg';

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

function zeitraumText(e: Pick<Abwesenheit, 'von' | 'bis' | 'stunden'>): string {
  if (e.von === e.bis) return format(ausText(e.von), 'EEE d.M.yyyy', { locale: de }) + (e.stunden ? ` · ${e.stunden} h` : '');
  return `${format(ausText(e.von), 'EEE d.M.', { locale: de })} – ${format(ausText(e.bis), 'EEE d.M.yyyy', { locale: de })}`;
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

function Kachel({ label, wert, klein, klasse }: { label: string; wert: string | number; klein?: string; klasse?: string }) {
  return (
    <div className="kachel glas">
      <div className="kachel-label">{label}</div>
      <div className={`kachel-wert ${klasse ?? ''}`}>
        {wert} {klein && <small>{klein}</small>}
      </div>
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

function KontoKacheln({ p, eintraege }: { p: Personal; eintraege: Abwesenheit[] }) {
  const k = useMemo(() => urlaubskonto(p, eintraege, heute()), [p, eintraege]);
  return (
    <div className="bs-kacheln ab-kacheln">
      <Kachel label="Resturlaub" wert={tage(k.rest, k.stundenProTag)} klasse={k.rest < 0 ? 'bs-warn' : 'bs-ok'} />
      <Kachel label="Verplant / beantragt" wert={tage(k.verplant, k.stundenProTag)} klasse="bs-klein" />
      <Kachel label="Verfällt in 3 Monaten" wert={tage(k.verfaelltBald, k.stundenProTag)} klasse={k.verfaelltBald > 0 ? 'bs-warn bs-klein' : 'bs-klein'} />
      <Kachel label="Pflegefreistellung" wert={`${tage(k.pflege.verbraucht, k.stundenProTag)} / ${tage(k.pflege.anspruch, k.stundenProTag)}`} klasse="bs-klein" />
      <Kachel label={`Krankentage ${new Date().getFullYear()}`} wert={krankTageImJahr(p, eintraege, new Date().getFullYear())} klasse="bs-klein" />
    </div>
  );
}

function Formular({ d, onDaten }: { d: AbwesenheitDaten; onDaten: (x: AbwesenheitDaten) => void }) {
  const [email, setEmail] = useState(d.ich.email);
  const [art, setArt] = useState<AbwArt>('urlaub');
  const [von, setVon] = useState(heute());
  const [bis, setBis] = useState(heute());
  const [stundenweise, setStundenweise] = useState(false);
  const [stunden, setStunden] = useState(4);
  const [notiz, setNotiz] = useState('');
  const [datei, setDatei] = useState<File | null>(null);
  const [dateiFeld, setDateiFeld] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const p = d.personal.find((x) => x.email === email);
  const bisWert = stundenweise ? von : bis;
  const kosten = p && von && bisWert >= von ? stundenVon(p, { id: '', email, art, von, bis: bisWert, status: 'beantragt', ...(stundenweise ? { stunden } : {}) }) : null;
  const personen = [...new Map([[d.ich.email, d.ich.email], ...d.personen.map((x) => [x.email, x.email] as const)]).keys()];

  const senden = () => {
    setLaeuft(true);
    setMeldung(null);
    abwesenheitEintragen({ email, art, von, bis: bisWert, ...(stundenweise ? { stunden } : {}), ...(notiz.trim() ? { notiz: notiz.trim() } : {}) })
      .then(async (x) => {
        onDaten(x);
        setNotiz('');
        const basis =
          art === 'krank' ? 'Krankmeldung gesendet. Gute Besserung!' : d.darfVerwalten ? 'Eingetragen und genehmigt.' : 'Antrag gesendet. Du siehst hier, sobald er genehmigt ist.';
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
        {!stundenweise && (
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
          {!ARTEN[art].genehmigung || d.darfVerwalten ? '' : ' Muss genehmigt werden.'}
        </p>
      )}
      {!p && <p className="klein">Für {email === d.ich.email ? 'dich' : nameVon(d, email)} sind noch keine Stammdaten (Eintritt, Stunden) hinterlegt – das Urlaubskonto erscheint, sobald das Büro sie einträgt.</p>}
      {meldung && <div className={`banner ${meldung.ok ? '' : 'fehler'}`}>{meldung.text}</div>}
      <button className="knopf primaer" disabled={laeuft || !von || bisWert < von} onClick={senden}>
        {laeuft ? 'Sende …' : art === 'krank' ? '🤒 Krankmeldung senden' : d.darfVerwalten ? 'Eintragen' : 'Beantragen'}
      </button>
    </article>
  );
}

function EintragListe({ d, eintraege, onDaten, mitName }: { d: AbwesenheitDaten; eintraege: Abwesenheit[]; onDaten: (x: AbwesenheitDaten) => void; mitName?: boolean }) {
  const [fehler, setFehler] = useState<string | null>(null);
  if (!eintraege.length) return <p className="leer">Keine Einträge</p>;
  return (
    <div className="ab-liste">
      {fehler && <div className="banner fehler">{fehler}</div>}
      {eintraege.map((e) => {
        const darf = d.darfVerwalten || (e.email === d.ich.email && e.status === 'beantragt');
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
              <BelegLeiste d={d} e={e} onDaten={onDaten} />
            </div>
            <div className="ab-eintrag-rechts">
              <span className={`ab-status ${e.status}`}>{STATUS[e.status]}</span>
              {darf && (
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

function TeamMonat({ d }: { d: AbwesenheitDaten }) {
  const [monat, setMonat] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const tage = tageListe(datumText(monat), datumText(new Date(monat.getFullYear(), monat.getMonth() + 1, 0)));
  const relevant = d.eintraege.filter((e) => e.status !== 'abgelehnt' && e.bis >= tage[0] && e.von <= tage[tage.length - 1]);
  const emails = [...new Set([...d.personal.filter((p) => !p.austritt || p.austritt >= tage[0]).map((p) => p.email), ...relevant.map((e) => e.email)])].sort((a, b) =>
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
      {emails.length === 0 ? (
        <p className="leer">Noch keine Mitarbeiter oder Abwesenheiten</p>
      ) : (
        <div className="bs-block">
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
                  <td className="ab-name">{nameVon(d, m)}</td>
                  {tage.map((t) => {
                    const e = zelle(m, t);
                    return (
                      <td
                        key={t}
                        className={`${frei(t) ? 'frei' : ''} ${e?.status === 'beantragt' ? 'beantragt' : ''}`}
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
  const offen = d.eintraege.filter((e) => e.status === 'beantragt');
  const heuteAbw = abwesendAm(d.eintraege, t);
  const woche = d.eintraege.filter((e) => zaehlt(e) && e.bis > t && e.von <= in7);
  const konflikte = (bs.daten?.eintraege ?? [])
    .filter((b) => b.bis > `${t}T00:00`)
    .flatMap((b) => {
      const ende = b.bis.endsWith('T00:00') ? datumText(plusTage(ausText(b.bis.slice(0, 10)), -1)) : b.bis.slice(0, 10);
      return d.eintraege.filter((e) => e.email === b.email && e.status !== 'abgelehnt' && e.von <= ende && e.bis >= b.von.slice(0, 10)).map((e) => ({ b, e }));
    });
  const konten = d.personal
    .filter((p) => !p.austritt || p.austritt >= t)
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
                  </b>
                  <div className="klein">
                    {zeitraumText(e)}
                    {p ? ` · ${e.art === 'urlaub' || e.art === 'pflege' ? tage(stundenVon(p, e), stundenJeTag(p)) : std(stundenVon(p, e))}` : ''}
                    {k && e.art === 'urlaub' ? ` · Rest ${tage(k.rest, k.stundenProTag)}` : ''}
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
                  <td className={k.rest < 0 ? 'ab-rot' : ''}>
                    {tage(k.rest, k.stundenProTag)}
                  </td>
                  <td>{tage(k.verplant, k.stundenProTag)}</td>
                  <td className={k.verfaelltBald > 0 ? 'ab-rot' : ''}>{tage(k.verfaelltBald, k.stundenProTag)}</td>
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

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

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

function PersonalVerwaltung({ d, onDaten }: { d: AbwesenheitDaten; onDaten: (x: AbwesenheitDaten) => void }) {
  const [liste, setListe] = useState<(Personal & { vorher?: string })[]>(() => d.personal.map((p) => ({ ...p, vorher: p.email })));
  const [imp, setImp] = useState<{ alt: AltMitarbeiter[]; zuordnung: Record<string, string> } | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setListe(d.personal.map((p) => ({ ...p, vorher: p.email }))), [d.personal]);
  const aendern = (i: number, x: Partial<Personal>) => setListe(liste.map((p, j) => (j === i ? { ...p, ...x } : p)));
  const fehlend = d.personen.filter((p) => !liste.some((x) => x.email === p.email));
  const fertig = (x: AbwesenheitDaten, text: string) => {
    onDaten(x);
    setMeldung({ ok: true, text });
  };

  const dateiLesen = (f: File) =>
    f.text().then((t) => {
      try {
        const alt = altdatenLesen(JSON.parse(t), heute());
        const zuordnung: Record<string, string> = {};
        for (const a of alt) {
          const treffer = d.personen.find((p) => p.name && p.name.toLowerCase() === a.name.toLowerCase()) ?? liste.find((p) => p.name.toLowerCase() === a.name.toLowerCase());
          zuordnung[a.mId] = treffer ? treffer.email : internesKonto(a.name, a.mId);
        }
        setImp({ alt, zuordnung });
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
      .then((x) => {
        setImp(null);
        fertig(x, `${gewaehlt.length} Mitarbeiter importiert.`);
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
        <table className="bs-tabelle ab-stamm">
          <thead>
            <tr>
              <th>Mitarbeiter</th>
              <th>Eintritt / Austritt</th>
              <th>Stunden Mo–So</th>
              <th>Vordienst / Wochen</th>
              <th>Übernahme</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {liste.map((p, i) => (
              <tr key={i}>
                <td>
                  <input className="feld" value={p.name} placeholder="Name" onChange={(e) => aendern(i, { name: e.target.value })} />
                  <KontoWahl wert={p.email} personen={d.personen} leer="Konto wählen …" neu={() => internesKonto(p.name, Date.now().toString(36))} onWahl={(email) => aendern(i, { email })} />
                </td>
                <td>
                  <input className="feld" type="date" value={p.eintritt} onChange={(e) => aendern(i, { eintritt: e.target.value })} />
                  <input className="feld" type="date" value={p.austritt ?? ''} onChange={(e) => aendern(i, { austritt: e.target.value || undefined })} />
                </td>
                <td>
                  <div className="ab-tage">
                    {p.tage.map((h, j) => (
                      <label key={j}>
                        <small>{WOCHENTAGE[j]}</small>
                        <input className="feld" type="number" min={0} max={24} step={0.5} value={h} onChange={(e) => aendern(i, { tage: p.tage.map((x, k) => (k === j ? Number(e.target.value) : x)) })} />
                      </label>
                    ))}
                  </div>
                </td>
                <td>
                  <input className="feld" type="number" min={0} step={1} title="Anrechenbare Vordienstjahre" placeholder="Vordienst J." value={p.vordienstjahre ?? ''} onChange={(e) => aendern(i, { vordienstjahre: e.target.value ? Number(e.target.value) : undefined })} />
                  <input className="feld" type="number" min={0} step={0.2} title="Urlaubswochen (leer = gesetzlich)" placeholder="Wochen (gesetzl.)" value={p.urlaubswochen ?? ''} onChange={(e) => aendern(i, { urlaubswochen: e.target.value ? Number(e.target.value) : undefined })} />
                </td>
                <td>
                  <input className="feld" type="date" title="Resturlaub übernommen am" value={p.saldoAb ?? ''} onChange={(e) => aendern(i, { saldoAb: e.target.value || undefined })} />
                  <input
                    className="feld"
                    type="number"
                    step={0.5}
                    title="Übernommener Resturlaub (Arbeitstage)"
                    placeholder="Rest Tage"
                    value={p.urlaubStartSaldo != null && stundenJeTag(p) > 0 ? Math.round((p.urlaubStartSaldo / stundenJeTag(p)) * 100) / 100 : ''}
                    onChange={(e) => aendern(i, { urlaubStartSaldo: e.target.value ? Math.round(Number(e.target.value) * stundenJeTag(p) * 100) / 100 : undefined })}
                  />
                  <label className="pille-wahl" title="Aus = Urlaub verfällt nie (wie im alten Programm)">
                    <input type="checkbox" checked={!p.ohneVerfall} onChange={(e) => aendern(i, { ohneVerfall: e.target.checked ? undefined : true })} /> verfällt nach Gesetz
                  </label>
                </td>
                <td>
                  <button className="knopf klein" onClick={() => setListe(liste.filter((_, j) => j !== i))} aria-label="Entfernen">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="ab-emails">
          {d.personen.map((p) => (
            <option key={p.email} value={p.email}>{p.name}</option>
          ))}
        </datalist>
        <div className="ab-zeile">
          <button className="knopf" onClick={() => setListe([...liste, { email: '', name: '', eintritt: heute(), tage: [...STANDARD_TAGE] }])}>+ Mitarbeiter</button>
          {fehlend.length > 0 && (
            <button className="knopf" onClick={() => setListe([...liste, ...fehlend.map((p) => ({ email: p.email, name: p.name ?? kurz(p.email), eintritt: heute(), tage: [...STANDARD_TAGE] }))])}>
              + {fehlend.length} aus der Rechteverwaltung
            </button>
          )}
          <button className="knopf primaer" onClick={() => personalSpeichern(liste).then((x) => fertig(x, 'Gespeichert.')).catch((e: Error) => setMeldung({ ok: false, text: e.message }))}>
            Speichern
          </button>
        </div>
      </section>

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

type Modus = 'meine' | 'team' | 'dashboard' | 'belege' | 'personal';
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
    ...(daten.darfVerwalten ? ([['dashboard', '◔ Dashboard'], ['belege', '🗂 Belege'], ['personal', '👥 Personal']] as [Modus, string][]) : []),
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
              {x === 'dashboard' && daten.eintraege.some((e) => e.status === 'beantragt') ? ' •' : ''}
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
      {m === 'team' && <TeamMonat d={daten} />}
      {m === 'dashboard' && <Dashboard d={daten} onDaten={setDaten} />}
      {m === 'belege' && <BelegArchiv d={daten} onDaten={setDaten} />}
      {m === 'personal' && <PersonalVerwaltung d={daten} onDaten={setDaten} />}
    </section>
  );
}
