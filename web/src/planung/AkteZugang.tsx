import { useEffect, useState } from 'react';
import type { Sicht } from '../shared/rechte';
import { KATEGORIE_SCHLUESSEL } from '../shared/rechte';
import { ROLLEN } from '../shared/rollen';
import { KATEGORIEN } from './planungLogic';
import { zugangLaden, zugangSpeichern, type Zugang } from './api';

const umschalten = <T,>(l: T[], x: T) => (l.includes(x) ? l.filter((y) => y !== x) : [...l, x]);

/** Reiter „Zugang & Rechte“: Gruppen, Rollen, Admin/Extern, Sichtbarkeit und Kiosk-PIN – gespeichert im Hub. */
export function AkteZugang({ email }: { email: string }) {
  const [z, setZ] = useState<Zugang | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [pin, setPin] = useState('');

  useEffect(() => {
    zugangLaden(email)
      .then(setZ)
      .catch((e: Error) => setFehler(e.message));
  }, [email]);

  async function aendern(x: Record<string, unknown>): Promise<boolean> {
    setLaeuft(true);
    setFehler(null);
    try {
      setZ(await zugangSpeichern(email, x));
      return true;
    } catch (e) {
      setFehler((e as Error).message);
      return false;
    } finally {
      setLaeuft(false);
    }
  }

  if (!z) return fehler ? <div className="banner fehler">{fehler}</div> : <p className="leer">Lädt …</p>;
  const b = z.benutzer;
  if (!b) return <p className="akte-leer">Diese Person ist im Hub noch nicht angelegt. Lege sie unter ⚙ Apps & Rechte → Mitarbeiter an.</p>;
  const sicht: Sicht = b.sicht ?? {};
  const sichtSetzen = (s: Partial<Sicht>) => {
    const n: Record<string, unknown> = { ...sicht, ...s };
    for (const k of Object.keys(n)) if (n[k] === undefined) delete n[k];
    void aendern({ sicht: n });
  };
  const kat = sicht.kategorien ?? [];
  const Wahl = ({ an, onClick, children }: { an: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" className={an ? 'an' : ''} aria-pressed={an} disabled={laeuft} onClick={onClick}>
      {children}
    </button>
  );

  return (
    <div className="akte-raster akte-zugang">
      {fehler && <div className="banner fehler">{fehler}</div>}
      <section className="akte-karte">
        <h4>Status</h4>
        <div className="akte-auswahl">
          <Wahl an={!!b.admin} onClick={() => void aendern({ admin: !b.admin })}>★ Admin</Wahl>
          <Wahl an={!!b.extern} onClick={() => void aendern({ extern: !b.extern })}>Extern</Wahl>
          <Wahl an={!!b.dritterNoetig} onClick={() => void aendern({ dritterNoetig: !b.dritterNoetig })}>Bereitschaft braucht Dritten</Wahl>
        </div>
        <small className="klein">Admins sehen und dürfen alles. Externe sind einteilbar, haben aber kein Urlaubskonto.</small>
      </section>
      <section className="akte-karte">
        <h4>Gruppen</h4>
        <div className="akte-auswahl">
          {z.gruppen.map((g) => (
            <Wahl key={g.id} an={b.gruppen.includes(g.id)} onClick={() => void aendern({ gruppen: umschalten(b.gruppen, g.id) })}>
              {g.name}
            </Wahl>
          ))}
        </div>
        {!b.gruppen.length && !b.admin && <small className="akte-warn">Ohne Gruppe sieht die Person keine Apps.</small>}
      </section>
      <section className="akte-karte">
        <h4>Rollen</h4>
        <div className="akte-auswahl">
          {ROLLEN.map((r) => (
            <Wahl key={r.id} an={!!b.rollen?.includes(r.id)} onClick={() => void aendern({ rollen: umschalten(b.rollen ?? [], r.id) })}>
              {r.label}
            </Wahl>
          ))}
        </div>
        <small className="klein">Für die Personalauswahl bei Terminen, Bereitschaft und Telefondienst.</small>
      </section>
      <section className="akte-karte">
        <h4>Sichtbarkeit in den Apps</h4>
        <div className="akte-auswahl">
          <Wahl an={sicht.termine === 'eigene'} onClick={() => sichtSetzen({ termine: sicht.termine ? undefined : 'eigene' })}>Nur eigene Termine</Wahl>
          <Wahl an={sicht.bereitschaft === 'eigene'} onClick={() => sichtSetzen({ bereitschaft: sicht.bereitschaft ? undefined : 'eigene' })}>Nur eigene Bereitschaft</Wahl>
          <Wahl an={!!sicht.telefonNurBereitschaft} onClick={() => sichtSetzen({ telefonNurBereitschaft: sicht.telefonNurBereitschaft ? undefined : true })}>Telefon nur in Bereitschaft</Wahl>
        </div>
        <small className="klein">Terminkategorien (keine gewählt = alle, die die Gruppe erlaubt):</small>
        <div className="akte-auswahl">
          {KATEGORIE_SCHLUESSEL.map((k) => (
            <Wahl key={k} an={kat.includes(k)} onClick={() => sichtSetzen({ kategorien: umschalten(kat, k).length ? umschalten(kat, k) : undefined })}>
              {KATEGORIEN[k].symbol} {KATEGORIEN[k].label}
            </Wahl>
          ))}
        </div>
      </section>
      <section className="akte-karte">
        <h4>Kiosk-PIN</h4>
        <p className="klein">{z.pin ? '✓ PIN gesetzt' : 'Keine PIN – Anmeldung am Kiosk nicht möglich.'}</p>
        <form
          className="akte-aktionen"
          onSubmit={(e) => {
            e.preventDefault();
            void aendern({ pin }).then((ok) => ok && setPin(''));
          }}
        >
          <input className="feld" inputMode="numeric" autoComplete="off" pattern="\d{4,8}" maxLength={8} placeholder="4–8 Ziffern" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          <button className="knopf klein primaer" disabled={laeuft || pin.length < 4}>
            {z.pin ? 'PIN ändern' : 'PIN setzen'}
          </button>
          {z.pin && (
            <button type="button" className="knopf klein rot" disabled={laeuft} onClick={() => void aendern({ pin: null })}>
              PIN löschen
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
