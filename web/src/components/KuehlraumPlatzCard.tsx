import { EndzielChip } from '../ui/SchrittBadge';
import { KuehlraumTerminMarker } from './KuehlraumTerminMarker';
import { istFreigabeWirksam } from '../board/freigabeLogic';
import type { Sterbefall } from '../types';

interface Props {
  platzNr: number;
  fall: Sterbefall;
  now: Date;
  expanded?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  pending?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onToggleExpand?: () => void;
  onAbschliessen: () => void;
}

export function KuehlraumPlatzCard({
  platzNr,
  fall,
  now,
  expanded,
  highlighted,
  dimmed,
  pending,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  onToggleExpand,
  onAbschliessen,
}: Props) {
  const name = fall.verstorbenerName || fall.sterbefallId || fall.id;
  const nextNach = fall.naechsterSchrittNach ?? fall.naechsteUeberfuehrungNach;
  const nextAm = fall.naechsterSchrittAm ?? fall.naechsteUeberfuehrungAm;
  const freigabeWirksam = istFreigabeWirksam(fall.freigabeFrei, fall.freigabeDatum, now);

  return (
    <article
      className={[
        'kr-platz-card',
        expanded ? 'expanded' : '',
        highlighted ? 'is-highlighted' : '',
        dimmed ? 'is-dimmed' : '',
        dragging ? 'is-dragging' : '',
        freigabeWirksam ? 'has-freigabe' : fall.freigabeFrei ? 'has-freigabe-geplant' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="kr-platz-top">
        {draggable && (
          <span
            className="kr-platz-drag"
            title="Ziehen zum Verschieben"
            aria-hidden
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', fall.id);
              onDragStart?.();
            }}
            onDragEnd={() => onDragEnd?.()}
          >
            ⠿
          </span>
        )}
        <span className="kr-platz-nr">Platz {platzNr}</span>
        {fall.sterbefallId && <span className="kr-platz-id">#{fall.sterbefallId}</span>}
        {fall.freigabeFrei && fall.freigabeDatum && (
          <span
            className={`kr-platz-freigabe ${freigabeWirksam ? 'wirksam' : 'geplant'}`}
            title="Freigabe"
          >
            {freigabeWirksam ? 'Frei' : `ab ${fall.freigabeDatum}`}
          </span>
        )}
      </div>

      <button
        type="button"
        className="kr-platz-main"
        onClick={onToggleExpand}
        aria-expanded={expanded}
      >
        <span className="kr-platz-name" title={name}>
          {name}
        </span>
        {!expanded && fall.aktuellePosition && (
          <span className="kr-platz-pos" title={fall.aktuellePosition}>
            {fall.aktuellePosition}
          </span>
        )}
      </button>

      <KuehlraumTerminMarker
        fall={fall}
        now={now}
        className="kr-platz-termin"
        compact={!expanded}
      />

      {expanded && (
        <div className="kr-platz-expanded">
          {fall.endziel && (
            <EndzielChip typ={fall.endzielTyp} ort={fall.endziel} />
          )}
          {nextNach && (
            <p className="kr-platz-next">
              <span className="kr-platz-next-label">Nächster Schritt</span>
              <span className="kr-platz-next-route">
                {nextAm && <time>{nextAm}</time>}
                <span>→ {nextNach}</span>
              </span>
            </p>
          )}
          {(fall.verlauf?.length ?? 0) > 0 && (
            <ul className="kr-platz-verlauf">
              {(fall.verlauf ?? []).slice(-3).map((v) => (
                <li key={v.nummer}>
                  <time>{v.terminAm ?? v.abholungAm}</time>
                  <span>
                    {v.vonOrt && v.nachOrt ? `${v.vonOrt} → ${v.nachOrt}` : v.ort}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="kr-platz-actions">
        <button
          type="button"
          className="kr-platz-abschluss"
          disabled={pending}
          onClick={onAbschliessen}
        >
          {pending ? '…' : 'Abschließen'}
        </button>
        {onToggleExpand && (
          <button
            type="button"
            className="kr-platz-details"
            onClick={onToggleExpand}
            aria-expanded={expanded}
          >
            {expanded ? '−' : '+'}
          </button>
        )}
      </div>
    </article>
  );
}
