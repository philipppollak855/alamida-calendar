import { useEffect, useState } from 'react';
import './planung.css';
import { hubAnmelden, ichLaden, type Ich } from './api';
import BereitschaftAnsicht from './BereitschaftAnsicht';

/** Eigenständige Bereitschaftsansicht (/bereitschaft), z. B. als eigene App im Bestattung Stranz HUB. */
export default function BereitschaftPage() {
  const [ich, setIch] = useState<Ich | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const theme = localStorage.getItem('alamida.theme') === 'hell' ? 'hell' : 'dunkel';

  useEffect(() => {
    const ticket = new URLSearchParams(location.hash.slice(1)).get('hub_ticket');
    if (location.hash) history.replaceState(null, '', location.pathname);
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
            <h2>Bereitschaft</h2>
            <p className="klein">Bitte anmelden.</p>
            <a className="knopf primaer" href="/api/auth/login">Mit Google anmelden</a>
          </div>
        ) : (
          <BereitschaftAnsicht aktiv={!!ich.rechte?.freigeschaltet} />
        )}
      </main>
    </div>
  );
}
