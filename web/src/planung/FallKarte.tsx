import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { KATEGORIEN, countdown, personalText, type Termin } from './planungLogic';

/** Sterbefall-Karte: Name oben, darunter je Termin eine anklickbare Unter-Karte. */
export default function FallKarte({ name, sterbefallId, termine, onOeffnen, mitName }: { name: string; sterbefallId?: string; termine: Termin[]; onOeffnen: (t: Termin) => void; mitName?: boolean }) {
  const jetzt = new Date();
  const naechster = termine.find((t) => t.ende > jetzt) ?? termine[0];
  const art = termine.find((t) => t.details.bestattungsart)?.details.bestattungsart;
  return (
    <div className="fall-karte">
      <button className="fall-kopf" onClick={() => onOeffnen(naechster)}>
        <span className="fall-name">{name}</span>
        <span className="fall-info">
          {[sterbefallId && `Nr. ${sterbefallId}`, art, `${termine.length} Termine`].filter(Boolean).join(' · ')}
        </span>
      </button>
      <div className="fall-unter">
        {termine.map((t) => {
          const k = KATEGORIEN[t.kategorie];
          const cd = countdown(t, jetzt);
          return (
            <button
              key={t.id}
              className={`fall-termin ${cd === 'läuft' ? 'laeuft' : ''} ${t.ende < jetzt ? 'vorbei' : ''}`}
              style={{ ['--kat' as string]: k.farbe }}
              onClick={() => onOeffnen(t)}
            >
              <span className="fall-zeit">{t.ganztaegig ? 'ganzt.' : format(t.start, 'HH:mm', { locale: de })}</span>
              <span className="fall-text">
                <span>
                  {k.symbol} {mitName ? t.verstorbener ?? t.titel : t.details.art ?? k.label}
                  {cd && <span className={`countdown ${cd === 'läuft' ? 'live' : ''}`}>{cd}</span>}
                </span>
                {(t.details.route ?? t.ort) && <span className="klein">{t.details.route ? `🧭 ${t.details.route}` : `📍 ${t.ort}`}</span>}
                {!!t.personal?.length && <span className="klein fall-personal">👥 {personalText(t)}</span>}
              </span>
              <span className="fall-pfeil">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
