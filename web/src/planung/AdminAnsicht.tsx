import { useEffect, useState } from 'react';
import { AGENT_KATEGORIEN, AGENT_STANDARD_DAUER, ALLE, KATEGORIE_SCHLUESSEL, type AgentKategorie, type Gruppe, type Konfiguration } from '../shared/rechte';
import { adminLaden, adminSpeichern, type AdminDaten } from './api';
import { KATEGORIEN, type Kategorie } from './planungLogic';

const HUB_URL = 'https://bestattung-stranz-hub.netlify.app';

const neueId = (name: string) =>
  name.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || `gruppe-${Date.now()}`;

function Auswahl({ werte, optionen, onChange }: { werte: string[]; optionen: { id: string; label: string }[]; onChange: (w: string[]) => void }) {
  const alle = werte.includes(ALLE);
  return (
    <div className="auswahl">
      <label className={`pille ${alle ? 'an' : ''}`}>
        <input type="checkbox" checked={alle} onChange={() => onChange(alle ? [] : [ALLE])} /> Alle
      </label>
      {optionen.map((o) => {
        const an = alle || werte.includes(o.id);
        return (
          <label key={o.id} className={`pille ${an ? 'an' : ''} ${alle ? 'gesperrt' : ''}`}>
            <input
              type="checkbox"
              disabled={alle}
              checked={an}
              onChange={() => onChange(werte.includes(o.id) ? werte.filter((x) => x !== o.id) : [...werte, o.id])}
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

export default function AdminAnsicht() {
  const [daten, setDaten] = useState<AdminDaten | null>(null);
  const [k, setK] = useState<Konfiguration | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [neuEmail, setNeuEmail] = useState('');

  useEffect(() => {
    adminLaden()
      .then((d) => {
        setDaten(d);
        setK(d.konfig);
      })
      .catch((e: Error) => setStatus(e.message));
  }, []);

  if (!k || !daten) return <p className="leer">{status ?? 'Lädt …'}</p>;

  const kalenderOptionen = [...new Map([...daten.kalenderGefunden, ...k.kalender].map((x) => [x.id, x])).values()].map((x) => ({
    id: x.id,
    label: x.name,
  }));
  const kategorieOptionen = KATEGORIE_SCHLUESSEL.map((x) => ({ id: x, label: `${KATEGORIEN[x as Kategorie].symbol} ${KATEGORIEN[x as Kategorie].label}` }));
  const gruppenOptionen = k.gruppen.map((g) => ({ id: g.id, label: g.name }));
  const aendern = (neu: Partial<Konfiguration>) => {
    setK({ ...k, ...neu });
    setStatus('Ungespeicherte Änderungen');
  };
  const ag = k.agent ?? { kategorien: {} };
  const agentKat = (key: string, neu: Partial<AgentKategorie>) => {
    const e: AgentKategorie = { ...ag.kategorien[key], ...neu };
    (Object.keys(e) as (keyof AgentKategorie)[]).forEach((x) => e[x] === undefined && delete e[x]);
    aendern({ agent: { ...ag, kategorien: { ...ag.kategorien, [key]: e } } });
  };
  const gruppeAendern = (id: string, neu: Partial<Gruppe>) => aendern({ gruppen: k.gruppen.map((g) => (g.id === id ? { ...g, ...neu } : g)) });

  async function speichern() {
    try {
      const r = await adminSpeichern(k!);
      setK(r.konfig);
      setStatus('Gespeichert ✓');
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <section className="ansicht admin">
      <div className="admin-kopf">
        <h2>Benutzer & Rechte</h2>
        {status && <span className="klein">{status}</span>}
        <button className="knopf primaer" onClick={speichern}>
          Speichern
        </button>
      </div>

      {k.hubVerwaltet ? (
        <article className="glas admin-block">
          <h3>Mitarbeiter (aus dem Hub)</h3>
          <p className="klein">
            Mitarbeiter, Gruppen und Admins pflegst du zentral im Hub unter{' '}
            <a href={`${HUB_URL}/verwaltung`} target="_top" rel="noopener">
              Apps &amp; Rechte
            </a>
            . Hier legst du je Gruppe nur fest, welche Kalender und Kategorien sie sieht.
          </p>
          <div className="admin-tabelle">
            {k.benutzer.map((b) => (
              <div key={b.email} className="admin-zeile">
                <div>
                  <strong>{b.name || b.email}</strong>
                  {b.name && <div className="klein">{b.email}</div>}
                </div>
                <div className="auswahl">
                  {b.gruppen.map((g) => (
                    <span key={g} className="pille an">
                      {k.gruppen.find((x) => x.id === g)?.name ?? g}
                    </span>
                  ))}
                  {b.admin && <span className="pille an">Admin</span>}
                  {!b.gruppen.length && !b.admin && <span className="klein">keine Gruppe</span>}
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : (
        <article className="glas admin-block">
          <h3>Benutzer</h3>
          <p className="klein">Wer sich mit Google anmeldet, sieht nur die Termine seiner Gruppen. Unbekannte Adressen sehen nichts.</p>
          <div className="admin-tabelle">
            {k.benutzer.map((b, i) => (
              <div key={b.email} className="admin-zeile">
                <div>
                  <strong>{b.email}</strong>
                  <input
                    className="feld klein-feld"
                    placeholder="Name"
                    value={b.name ?? ''}
                    onChange={(e) => aendern({ benutzer: k.benutzer.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                  />
                </div>
                <Auswahl
                  werte={b.gruppen}
                  optionen={gruppenOptionen}
                  onChange={(w) => aendern({ benutzer: k.benutzer.map((x, j) => (j === i ? { ...x, gruppen: w.filter((g) => g !== ALLE) } : x)) })}
                />
                <label className={`pille ${b.admin ? 'an' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!b.admin}
                    onChange={() => aendern({ benutzer: k.benutzer.map((x, j) => (j === i ? { ...x, admin: !x.admin } : x)) })}
                  />
                  Admin
                </label>
                <button className="knopf klein-knopf" onClick={() => aendern({ benutzer: k.benutzer.filter((_, j) => j !== i) })}>
                  Entfernen
                </button>
              </div>
            ))}
          </div>
          <form
            className="admin-neu"
            onSubmit={(e) => {
              e.preventDefault();
              const email = neuEmail.trim().toLowerCase();
              if (!email.includes('@') || k.benutzer.some((b) => b.email === email)) return;
              aendern({ benutzer: [...k.benutzer, { email, gruppen: [] }] });
              setNeuEmail('');
            }}
          >
            <input className="feld" type="email" placeholder="name@firma.at" value={neuEmail} onChange={(e) => setNeuEmail(e.target.value)} />
            <button className="knopf">+ Benutzer</button>
          </form>
        </article>
      )}

      <article className="glas admin-block">
        <h3>Gruppen</h3>
        {k.gruppen.map((g) => (
          <div key={g.id} className="admin-gruppe">
            <div className="admin-gruppe-kopf">
              {k.hubVerwaltet ? (
                <strong>{g.name}</strong>
              ) : (
                <input className="feld" value={g.name} onChange={(e) => gruppeAendern(g.id, { name: e.target.value })} />
              )}
              {!k.hubVerwaltet && (
              <button
                className="knopf klein-knopf"
                onClick={() =>
                  aendern({
                    gruppen: k.gruppen.filter((x) => x.id !== g.id),
                    benutzer: k.benutzer.map((b) => ({ ...b, gruppen: b.gruppen.filter((x) => x !== g.id) })),
                  })
                }
              >
                Löschen
              </button>
              )}
            </div>
            <div className="klein">Kategorien</div>
            <Auswahl werte={g.kategorien} optionen={kategorieOptionen} onChange={(w) => gruppeAendern(g.id, { kategorien: w })} />
            <div className="klein">Kalender</div>
            <Auswahl werte={g.kalender} optionen={kalenderOptionen} onChange={(w) => gruppeAendern(g.id, { kalender: w })} />
          </div>
        ))}
        {!k.hubVerwaltet && (
        <button
          className="knopf"
          onClick={() => {
            const name = `Neue Gruppe ${k.gruppen.length + 1}`;
            aendern({ gruppen: [...k.gruppen, { id: neueId(name), name, kategorien: [ALLE], kalender: [ALLE] }] });
          }}
        >
          + Gruppe
        </button>
        )}
      </article>

      <article className="glas admin-block">
        <h3>Bereitschaft</h3>
        <p className="klein">Jeder trägt sich selbst ein. Mitglieder dieser Gruppen dürfen zusätzlich alle einteilen (Admins immer).</p>
        <Auswahl werte={k.bereitschaftGruppen ?? []} optionen={gruppenOptionen} onChange={(w) => aendern({ bereitschaftGruppen: w })} />
      </article>

      <article className="glas admin-block">
        <h3>Personalplanung</h3>
        <p className="klein">Mitglieder dieser Gruppen teilen Personal bei Terminen ein: Gespräche 1 Person, Überführungen, Begräbnisse usw. höchstens 5 (Admins immer).</p>
        <Auswahl werte={k.personalGruppen ?? []} optionen={gruppenOptionen} onChange={(w) => aendern({ personalGruppen: w })} />
      </article>

      <article className="glas admin-block">
        <h3>Urlaub / Krank</h3>
        <p className="klein">Mitglieder dieser Gruppen sehen alle Abwesenheiten, genehmigen Anträge und pflegen die Personal-Stammdaten (Admins immer).</p>
        <Auswahl werte={k.abwesenheitGruppen ?? []} optionen={gruppenOptionen} onChange={(w) => aendern({ abwesenheitGruppen: w })} />
      </article>

      {!k.hubVerwaltet && (
      <article className="glas admin-block">
        <h3>Ganze Firma freischalten</h3>
        <p className="klein">Alle Adressen einer Domain bekommen automatisch diese Gruppen (z. B. firma.at).</p>
        {k.domains.map((d, i) => (
          <div key={i} className="admin-zeile">
            <input
              className="feld"
              value={d.domain}
              placeholder="firma.at"
              onChange={(e) => aendern({ domains: k.domains.map((x, j) => (j === i ? { ...x, domain: e.target.value } : x)) })}
            />
            <Auswahl
              werte={d.gruppen}
              optionen={gruppenOptionen}
              onChange={(w) => aendern({ domains: k.domains.map((x, j) => (j === i ? { ...x, gruppen: w.filter((g) => g !== ALLE) } : x)) })}
            />
            <button className="knopf klein-knopf" onClick={() => aendern({ domains: k.domains.filter((_, j) => j !== i) })}>
              Entfernen
            </button>
          </div>
        ))}
        <button className="knopf" onClick={() => aendern({ domains: [...k.domains, { domain: '', gruppen: [] }] })}>
          + Domain
        </button>
      </article>
      )}

      <article className="glas admin-block">
        <h3>Kalender</h3>
        <p className="klein">
          Jeden Kalender in Google für <strong>{daten.serviceAccountEmail || 'den Service Account'}</strong> freigeben und hier mit Kalender-ID eintragen.
        </p>
        {k.kalender.map((c, i) => (
          <div key={i} className="admin-zeile">
            <input
              className="feld"
              value={c.name}
              placeholder="Name"
              onChange={(e) => aendern({ kalender: k.kalender.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
            />
            <input
              className="feld breit"
              value={c.id}
              placeholder="…@group.calendar.google.com"
              onChange={(e) => aendern({ kalender: k.kalender.map((x, j) => (j === i ? { ...x, id: e.target.value.trim() } : x)) })}
            />
            <button className="knopf klein-knopf" onClick={() => aendern({ kalender: k.kalender.filter((_, j) => j !== i) })}>
              Entfernen
            </button>
          </div>
        ))}
        <button className="knopf" onClick={() => aendern({ kalender: [...k.kalender, { id: '', name: '' }] })}>
          + Kalender
        </button>
        {daten.kalenderGefunden.length > 0 && (
          <p className="klein">Gefunden: {daten.kalenderGefunden.map((x) => x.name).join(', ')}</p>
        )}
      </article>

      <article className="glas admin-block">
        <h3>Alamida-Agent: Kalender & Dauer je Kategorie</h3>
        <p className="klein">
          Gilt für alle PCs mit dem Agent und wird spätestens nach 5 Minuten übernommen. Jeder Kalender muss oben unter „Kalender“ stehen und in Google für den
          Service Account mit „Änderungen an Terminen vornehmen“ freigegeben sein.
        </p>
        <div className="admin-zeile agent-zeile">
          <strong>Standard-Kalender</strong>
          <select
            className="feld"
            value={ag.standardKalender ?? ''}
            onChange={(e) => aendern({ agent: { ...ag, standardKalender: e.target.value || undefined } })}
          >
            <option value="">wie am PC eingestellt</option>
            {kalenderOptionen.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {AGENT_KATEGORIEN.map((key) => {
          const e = ag.kategorien[key] ?? {};
          const info = KATEGORIEN[key as Kategorie];
          return (
            <div key={key} className="admin-zeile agent-zeile">
              <span>
                {info.symbol} {info.label}
              </span>
              <select className="feld" value={e.kalender ?? ''} onChange={(ev) => agentKat(key, { kalender: ev.target.value || undefined })}>
                <option value="">Standard-Kalender</option>
                {kalenderOptionen.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <label className="agent-dauer">
                <input
                  className="feld"
                  type="number"
                  min={15}
                  max={1440}
                  step={15}
                  value={e.dauer ?? ''}
                  placeholder={String(AGENT_STANDARD_DAUER[key] ?? 60)}
                  onChange={(ev) => agentKat(key, { dauer: ev.target.value ? Number(ev.target.value) : undefined })}
                />
                <span className="klein">Min.</span>
              </label>
              <label className="klein">
                <input type="checkbox" checked={e.aktiv !== false} onChange={(ev) => agentKat(key, { aktiv: ev.target.checked ? undefined : false })} />{' '}
                übertragen
              </label>
            </div>
          );
        })}
        <h4>Agent-PCs</h4>
        {(daten.agentStatus ?? []).length === 0 ? (
          <p className="klein">Noch kein Agent hat sich gemeldet. Ab der neuen Agent-Version stehen hier PC, Version, letzter Abgleich und Fehler.</p>
        ) : (
          (daten.agentStatus ?? []).map((s) => (
            <div key={s.station} className="agent-status">
              <strong>{s.station}</strong>
              <span className="klein">
                Version {s.version} · gemeldet {new Date(s.zeit).toLocaleString('de-AT')} · {s.termine ?? 0} Termine · Einstellungen{' '}
                {s.zentral ? 'übernommen' : 'noch nicht geladen'}
              </span>
              <span className="klein">{s.status}</span>
              {s.vorsorge && <span className="klein">Vorsorge: {s.vorsorge}</span>}
              {s.fehler && <span className="klein agent-fehler">⚠ {s.fehler}</span>}
            </div>
          ))
        )}
      </article>
    </section>
  );
}
