import { useEffect, useState } from 'react';
import './planung.css';
import { useTheme } from './theme';
import { hubAnmelden, ichLaden, type Ich } from './api';
import TelefonAnsicht from './TelefonAnsicht';
import { NACH_ANMELDUNG } from './BereitschaftAnsicht';

/** Eigenständiger Telefondienst (/telefon), als eigene App im Bestattung Stranz HUB (Rolle Telefon / Bereitschaft). */
export default function TelefonPage() {
  const [ich, setIch] = useState<Ich | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [theme] = useTheme();

  useEffect(() => {
    const ticket = new URLSearchParams(location.hash.slice(1)).get('hub_ticket');
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    (ticket ? hubAnmelden(ticket).catch((e: Error) => setFehler(e.message)) : Promise.resolve())
      .then(() => ichLaden())
      .then(setIch)
      .catch(() => setIch({ angemeldet: false }));
  }, []);

  return (
    <div className={`planung theme-${theme} bereitschaft-seite`}>
      <main className="inhalt">
        {fehler && <div className="banner fehler">{fehler}</div>}
        {!ich ? (
          <p className="leer">Lädt …</p>
        ) : !ich.angemeldet ? (
          <div className="glas admin-block">
            <h2>Telefondienst</h2>
            <p className="klein">Bitte anmelden.</p>
            <a className="knopf primaer" href="/api/auth/login" onClick={() => localStorage.setItem(NACH_ANMELDUNG, '/telefon')}>
              Mit Google anmelden
            </a>
          </div>
        ) : (
          <TelefonAnsicht />
        )}
      </main>
    </div>
  );
}
