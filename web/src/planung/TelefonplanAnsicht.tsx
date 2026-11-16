import { useCallback, useEffect, useMemo, useState } from 'react';
import { datumText, plusTage, spanneText, ueberschneidet, zeitText } from '../shared/bereitschaft';
import { KERN_NAMEN, KERN_SCHLUESSEL, WOCHENTAGE, belegung, kernLuecken, kernText, musterText, tagesAbschnitte, type Kernzeit, type Kernzeiten, type TelMuster, type TelSegment } from '../shared/telefonplan';
import { telKernSpeichern, telMusterLoeschen, telMusterSpeichern, telefonplanAustragen, telefonplanEintragen, telefonplanLaden, type TelefonplanDaten } from './api';
import { standText } from './offlineCache';

const montag = (d: Date) => {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return plusTage(t, -((t.getDay() + 6) % 7));
};
const kurz = (d: Date) => d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
const zeitKurz = (z: string) => `${z.slice(8, 10)}.${z.slice(5, 7)}. ${z.slice(11, 16)}`;
const kw = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7)));
  const j = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - j.getTime()) / 86_400_000 - 3 + ((j.getUTCDay() + 6) % 7)) / 7);
};
const wer = (s: { email: string; name?: string }) => s.name || s.email;

type Eintrag = { email: string; von: string; bis: string };

function EintragModal({ e, daten, von, setDaten, zu }: { e: Eintrag; daten: TelefonplanDaten; von: string; setDaten: (d: TelefonplanDaten) => void; zu: () => void }) {
  const [x, setX] = useState(e);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const speichern = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      setDaten(await telefonplanEintragen(von, x));
      zu();
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <div className="modal-hintergrund" onClick={zu}>
      <div className="modal ab-modal" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-kopf" style={{ background: '#3b82f6' }}>
          <div>
            <div className="modal-kategorie">📞 Telefonbereitschaft</div>
            <h2>Eintragen</h2>
            <div className="modal-nr">Ersetzt für diese Zeit das Muster.</div>
          </div>
          <button className="modal-zu" onClick={zu} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="modal-inhalt ab-formular">
          {daten.darfPlanen ? (
            <label className="ab-feld">
              Person
              <select className="feld" value={x.email} onChange={(ev) => setX({ ...x, email: ev.target.value })}>
                {!daten.personen.some((p) => p.email === x.email) && <option value={x.email}>{x.email === daten.ich.email ? daten.ich.name || 'Ich' : x.email}</option>}
                {daten.personen.map((p) => (
                  <option key={p.email} value={p.email}>
                    {wer(p)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="klein">Für: {daten.ich.name || daten.ich.email}</p>
          )}
          <div className="ab-zeile">
            <label className="ab-feld">
              Von
              <input className="feld" type="datetime-local" value={x.von} onChange={(ev) => setX({ ...x, von: ev.target.value })} />
            </label>
            <label className="ab-feld">
              Bis
              <input className="feld" type="datetime-local" value={x.bis} onChange={(ev) => setX({ ...x, bis: ev.target.value })} />
            </label>
          </div>
          {fehler && <div className="banner fehler">{fehler}</div>}
          <div className="ab-modal-knoepfe">
            <button className="knopf primaer" disabled={laeuft || !x.von || !x.bis} onClick={() => void speichern()}>
              Eintragen
            </button>
            <button className="knopf" onClick={zu}>
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MusterModal({ m, daten, von, setDaten, zu }: { m: Partial<TelMuster>; daten: TelefonplanDaten; von: string; setDaten: (d: TelefonplanDaten) => void; zu: () => void }) {
  const [x, setX] = useState<Partial<TelMuster>>(m);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const tun = async (f: () => Promise<TelefonplanDaten>) => {
    setLaeuft(true);
    setFehler(null);
    try {
      setDaten(await f());
      zu();
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setLaeuft(false);
    }
  };
  const tage = x.tage ?? [];
  return (
    <div className="modal-hintergrund" onClick={zu}>
      <div className="modal ab-modal" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-kopf" style={{ background: '#3b82f6' }}>
          <div>
            <div className="modal-kategorie">📞 Telefonbereitschaft</div>
            <h2>{m.id ? 'Muster bearbeiten' : 'Neues Muster'}</h2>
            <div className="modal-nr">Wiederkehrender Dienst, freie Einträge gehen vor.</div>
          </div>
          <button className="modal-zu" onClick={zu} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="modal-inhalt ab-formular">
          <label className="ab-feld">
            Person
            <select className="feld" value={x.email ?? ''} onChange={(ev) => setX({ ...x, email: ev.target.value })}>
              <option value="">– wählen –</option>
              {daten.personen.map((p) => (
                <option key={p.email} value={p.email}>
                  {wer(p)}
                </option>
              ))}
            </select>
          </label>
          <div className="ab-feld">
            Beginn an
            <div className="ab-arten">
              {[1, 2, 3, 4, 5, 6, 0].map((t) => (
                <button key={t} type="button" className={`pille ${tage.includes(t) ? 'an' : ''}`} onClick={() => setX({ ...x, tage: tage.includes(t) ? tage.filter((y) => y !== t) : [...tage, t] })}>
                  {WOCHENTAGE[t]}
                </button>
              ))}
              <button type="button" className="pille" onClick={() => setX({ ...x, tage: [1, 2, 3, 4] })}>
                Mo–Do
              </button>
              <button type="button" className="pille" onClick={() => setX({ ...x, tage: [1, 2, 3, 4, 5, 6, 0] })}>
                täglich
              </button>
            </div>
          </div>
          <div className="ab-zeile">
            <label className="ab-feld">
              Von
              <input className="feld" type="time" value={x.von ?? ''} onChange={(ev) => setX({ ...x, von: ev.target.value })} />
            </label>
            <label className="ab-feld">
              Bis {x.von && x.bis && x.bis <= x.von && <span className="klein">(Folgetag)</span>}
              <input className="feld" type="time" value={x.bis ?? ''} onChange={(ev) => setX({ ...x, bis: ev.target.value })} />
            </label>
            <label className="ab-feld">
              Rhythmus
              <select className="feld" value={x.intervall ?? 1} onChange={(ev) => setX({ ...x, intervall: Number(ev.target.value) })}>
                <option value={1}>jede Woche</option>
                <option value={2}>jede 2. Woche</option>
                <option value={3}>jede 3. Woche</option>
                <option value={4}>jede 4. Woche</option>
              </select>
            </label>
          </div>
          <div className="ab-zeile">
            <label className="ab-feld">
              Gültig ab {(x.intervall ?? 1) > 1 && <span className="klein">(diese Woche zählt als 1.)</span>}
              <input className="feld" type="date" value={x.ab ?? ''} onChange={(ev) => setX({ ...x, ab: ev.target.value })} />
            </label>
            <label className="ab-feld">
              Gültig bis (optional)
              <input className="feld" type="date" value={x.ende ?? ''} onChange={(ev) => setX({ ...x, ende: ev.target.value || undefined })} />
            </label>
          </div>
          {fehler && <div className="banner fehler">{fehler}</div>}
          <div className="ab-modal-knoepfe">
            <button className="knopf primaer" disabled={laeuft} onClick={() => void tun(() => telMusterSpeichern(von, x))}>
              Speichern
            </button>
            {m.id && (
              <button className="knopf gefahr" disabled={laeuft} onClick={() => confirm('Muster löschen?') && void tun(() => telMusterLoeschen(von, m.id!))}>
                Löschen
              </button>
            )}
            <button className="knopf" onClick={zu}>
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KernModal({ daten, von, setDaten, zu }: { daten: TelefonplanDaten; von: string; setDaten: (d: TelefonplanDaten) => void; zu: () => void }) {
  const [k, setK] = useState<Kernzeiten>(() => structuredClone(daten.kernzeiten ?? {}));
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const setzen = (key: keyof Kernzeiten, l: Kernzeit[] | undefined) => {
    const neu = { ...k };
    if (l) neu[key] = l;
    else delete neu[key];
    setK(neu);
  };
  const speichern = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      setDaten(await telKernSpeichern(von, k));
      zu();
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <div className="modal-hintergrund" onClick={zu}>
      <div className="modal ab-modal" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-kopf" style={{ background: '#3b82f6' }}>
          <div>
            <div className="modal-kategorie">📞 Telefonbereitschaft</div>
            <h2>Kernzeiten</h2>
            <div className="modal-nr">In diesen Zeiten muss jemand das Telefon haben. Endet eine Zeit vor dem Beginn, reicht sie in den Folgetag.</div>
          </div>
          <button className="modal-zu" onClick={zu} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="modal-inhalt ab-formular">
          {KERN_SCHLUESSEL.map((key) => {
            const l = k[key];
            return (
              <div key={key} className="kern-zeile">
                <b>{KERN_NAMEN[key]}</b>
                <div className="kern-zeiten">
                  {key === 'ft' && !l && <span className="klein">wie Wochentag</span>}
                  {l?.length === 0 && <span className="klein">keine Kernzeit</span>}
                  {l?.map((z, i) => (
                    <span key={i} className="kern-zeit">
                      <input className="feld" type="time" aria-label="Beginn" value={z.von} onChange={(e) => setzen(key, l.map((y, j) => (j === i ? { ...y, von: e.target.value } : y)))} />
                      –
                      <input className="feld" type="time" aria-label="Ende" value={z.bis} onChange={(e) => setzen(key, l.map((y, j) => (j === i ? { ...y, bis: e.target.value } : y)))} />
                      {z.von && z.bis && z.bis <= z.von && <span className="klein">+1</span>}
                      <button type="button" className="knopf klein-knopf" aria-label="Zeit entfernen" onClick={() => setzen(key, l.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    </span>
                  ))}
                  {(l?.length ?? 0) < 4 && (
                    <button type="button" className="pille" onClick={() => setzen(key, [...(l ?? []), key === 'ft' || key === '0' || key === '6' ? { von: '00:00', bis: '00:00' } : { von: '17:00', bis: '08:00' }])}>
                      ＋ Zeit
                    </button>
                  )}
                  {key !== '1' && key !== 'ft' && (
                    <button type="button" className="pille" onClick={() => setzen(key, structuredClone(k['1'] ?? []))}>
                      wie Mo
                    </button>
                  )}
                  {key === 'ft' && l && (
                    <button type="button" className="pille" onClick={() => setzen('ft', undefined)}>
                      wie Wochentag
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {fehler && <div className="banner fehler">{fehler}</div>}
          <div className="ab-modal-knoepfe">
            <button className="knopf primaer" disabled={laeuft} onClick={() => void speichern()}>
              Speichern
            </button>
            <button className="knopf" onClick={zu}>
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Telefonbereitschaft: Wochenplan aus Mustern und freien Einträgen, genau eine Person gleichzeitig. */
export default function TelefonplanAnsicht() {
  const [woche, setWoche] = useState(() => montag(new Date()));
  const von = datumText(plusTage(woche, -1));
  const [daten, setDaten] = useState<TelefonplanDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [eintrag, setEintrag] = useState<Eintrag | null>(null);
  const [muster, setMuster] = useState<Partial<TelMuster> | null>(null);
  const [kernOffen, setKernOffen] = useState(false);

  const laden = useCallback(() => {
    telefonplanLaden(von)
      .then((d) => {
        setDaten(d);
        setFehler(d.offlineStand ? standText(d.offlineStand) : null);
      })
      .catch((e: Error) => setFehler(e.message));
  }, [von]);
  useEffect(laden, [laden]);

  const tage = useMemo(() => Array.from({ length: 7 }, (_, i) => plusTage(woche, i)), [woche]);
  const segmente = useMemo(() => (daten ? belegung(daten.eintraege, daten.muster, woche, plusTage(woche, 7)) : []), [daten, woche]);
  const luecken = useMemo(() => {
    const jetzt = zeitText(new Date());
    return daten?.kernzeiten ? kernLuecken(segmente, daten.kernzeiten, woche, plusTage(woche, 7)).filter((l) => l.bis > jetzt) : [];
  }, [daten, segmente, woche]);

  if (!daten) return <p className="leer">{fehler ?? 'Lädt …'}</p>;
  const heute = datumText(new Date());
  const darf = daten.darfEintragen || daten.darfPlanen;
  const neu = (v: string, b: string) => darf && setEintrag({ email: daten.ich.email, von: v, bis: b });
  const segmentKlick = async (s: TelSegment) => {
    if (s.quelle === 'eintrag' && (s.email === daten.ich.email || daten.darfPlanen)) {
      if (!confirm(`${wer(s)} ${zeitKurz(s.von)} – ${zeitKurz(s.bis)} austragen?`)) return;
      try {
        setDaten(await telefonplanAustragen(von, s.id));
      } catch (e) {
        setFehler((e as Error).message);
      }
    } else if (s.quelle === 'muster') neu(s.von, s.bis);
  };
  const tagEnde = (t: Date, uhr: string) => (uhr === '24:00' ? `${datumText(plusTage(t, 1))}T00:00` : `${datumText(t)}T${uhr}`);

  return (
    <section className="telplan">
      <div className="glas tel-jetzt">
        📞 {daten.jetzt ? (
          <>
            Jetzt: <b>{wer(daten.jetzt)}</b> bis {zeitKurz(daten.jetzt.bis)}
          </>
        ) : (
          'Gerade ist niemand für das Telefon eingeteilt'
        )}
      </div>
      {luecken.length > 0 && (
        <div className="banner warnung telplan-kern-warnung">
          ⚠ Kernzeit unbesetzt: {luecken.map((l) => spanneText(l.von, l.bis)).join(' · ')}
        </div>
      )}
      {fehler && <div className="banner fehler">{fehler}</div>}
      <div className="tag-nav telplan-nav">
        <div className="tag-nav-knoepfe">
          <button onClick={() => setWoche(plusTage(woche, -7))} aria-label="Vorige Woche">
            ◀
          </button>
          <button onClick={() => setWoche(montag(new Date()))}>Heute</button>
          <button onClick={() => setWoche(plusTage(woche, 7))} aria-label="Nächste Woche">
            ▶
          </button>
        </div>
        <b>
          KW {kw(woche)} · {kurz(woche)} – {kurz(plusTage(woche, 6))}
        </b>
        {darf && (
          <button className="knopf primaer klein" onClick={() => neu(zeitText(new Date(new Date().setMinutes(0, 0, 0))), zeitText(new Date(new Date().setMinutes(0, 0, 0) + 12 * 3_600_000)))}>
            ＋ Eintragen
          </button>
        )}
      </div>
      <div className="telplan-woche">
        {tage.map((t) => {
          const tag = datumText(t);
          return (
            <div key={tag} className={`glas telplan-tag ${tag === heute ? 'heute' : ''}`}>
              <div className="telplan-datum">
                <b>{WOCHENTAGE[t.getDay()]}</b> {kurz(t)}
              </div>
              <div className="telplan-abschnitte">
                {tagesAbschnitte(segmente, tag).map((a) =>
                  a.s ? (
                    <button key={a.von + a.s.id} className={`telplan-abschnitt ${a.s.quelle} ${a.s.email === daten.ich.email ? 'meins' : ''}`} onClick={() => void segmentKlick(a.s!)} title={a.s.quelle === 'muster' ? 'Aus Muster – antippen für Vertretung' : 'Eingetragen – antippen zum Austragen'}>
                      <span className="telplan-zeit">
                        {a.von}–{a.bis}
                      </span>
                      <span>{wer(a.s)}</span>
                      <span className="klein">{a.s.quelle === 'muster' ? '↻' : '✎'}</span>
                    </button>
                  ) : (() => {
                    const kern = luecken.some((l) => ueberschneidet(l, { von: `${tag}T${a.von}`, bis: tagEnde(t, a.bis) }));
                    return (
                      <button key={a.von} className={`telplan-abschnitt frei ${kern ? 'kern' : ''}`} disabled={!darf} onClick={() => neu(`${tag}T${a.von}`, tagEnde(t, a.bis))}>
                        <span className="telplan-zeit">
                          {a.von}–{a.bis}
                        </span>
                        <span className="klein">{kern ? '⚠ Kernzeit frei' : 'frei'}{darf ? ' · ＋' : ''}</span>
                      </button>
                    );
                  })(),
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="glas admin-block telplan-muster">
        <div className="telplan-muster-kopf">
          <h3>⏰ Kernzeiten</h3>
          {daten.darfPlanen && (
            <button className="knopf klein" onClick={() => setKernOffen(true)}>
              Festlegen
            </button>
          )}
        </div>
        <p className="klein">{daten.kernzeiten && kernText(daten.kernzeiten) ? kernText(daten.kernzeiten) : `Noch keine Kernzeiten.${daten.darfPlanen ? ' Lege fest, wann das Telefon besetzt sein muss – je Wochentag und für Feiertage.' : ''}`}</p>
      </div>
      <div className="glas admin-block telplan-muster">
        <div className="telplan-muster-kopf">
          <h3>↻ Muster</h3>
          {daten.darfPlanen && (
            <button className="knopf klein" onClick={() => setMuster({ tage: [1, 2, 3, 4], von: '17:00', bis: '08:00', intervall: 1, ab: datumText(woche) })}>
              ＋ Muster
            </button>
          )}
        </div>
        {daten.muster.length === 0 && <p className="klein">Noch kein Muster. {daten.darfPlanen ? 'Lege z. B. „Mo–Do 17:00–08:00“ für eine Person an.' : ''}</p>}
        {daten.muster.map((m) => (
          <button key={m.id} className="telplan-muster-zeile" disabled={!daten.darfPlanen} onClick={() => setMuster(m)}>
            <b>{wer(m)}</b>
            <span>{musterText(m)}</span>
            <span className="klein">
              ab {m.ab.split('-').reverse().join('.')}
              {m.ende ? ` bis ${m.ende.split('-').reverse().join('.')}` : ''}
            </span>
          </button>
        ))}
      </div>
      {eintrag && <EintragModal e={eintrag} daten={daten} von={von} setDaten={setDaten} zu={() => setEintrag(null)} />}
      {kernOffen && <KernModal daten={daten} von={von} setDaten={setDaten} zu={() => setKernOffen(false)} />}
      {muster && <MusterModal m={muster} daten={daten} von={von} setDaten={setDaten} zu={() => setMuster(null)} />}
    </section>
  );
}
