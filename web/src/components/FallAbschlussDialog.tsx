import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FALL_ABSCHLUSS_GRUENDE,
  type FallAbschlussGrund,
} from '../board/fallAbschluss';
import type { Sterbefall } from '../types';

interface Props {
  fall: Sterbefall | null;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (grund: FallAbschlussGrund, bemerkung?: string) => void;
}

export function FallAbschlussDialog({
  fall,
  pending,
  error,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const [grund, setGrund] = useState<FallAbschlussGrund | null>(null);
  const [bemerkung, setBemerkung] = useState('');

  useEffect(() => {
    if (!fall) {
      setGrund(null);
      setBemerkung('');
    }
  }, [fall]);

  useEffect(() => {
    if (!fall) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fall, onClose, pending]);

  if (!fall) return null;

  const name = fall.verstorbenerName || fall.sterbefallId || fall.id;
  const selected = FALL_ABSCHLUSS_GRUENDE.find((g) => g.id === grund);
  const needsNote = grund === 'sonstiges';
  const canSubmit = !!grund && (!needsNote || bemerkung.trim().length > 0) && !pending;

  return createPortal(
    <div
      className="fall-abschluss-backdrop"
      role="presentation"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="fall-abschluss-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fall-abschluss-head">
          <div>
            <p className="fall-abschluss-kicker">Fall abschließen</p>
            <h2 id={titleId} className="fall-abschluss-title">
              {name}
            </h2>
            <p className="fall-abschluss-sub">
              {fall.sterbefallId && <span>#{fall.sterbefallId}</span>}
              {fall.aktuellePosition && (
                <span>{fall.sterbefallId ? ' · ' : ''}{fall.aktuellePosition}</span>
              )}
            </p>
          </div>
          <button
            type="button"
            className="fall-abschluss-close"
            aria-label="Schließen"
            disabled={pending}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <p className="fall-abschluss-lead">
          Der Fall verschwindet aus Kühlraum, Disposition und Wandmonitor. In Alamida bleibt er
          unverändert.
        </p>

        <div className="fall-abschluss-gruende" role="radiogroup" aria-label="Abschlussgrund">
          {FALL_ABSCHLUSS_GRUENDE.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={grund === g.id}
              className={`fall-abschluss-grund ${grund === g.id ? 'active' : ''}`}
              disabled={pending}
              onClick={() => setGrund(g.id)}
            >
              <span className="fall-abschluss-grund-icon" aria-hidden>
                {g.icon}
              </span>
              <span className="fall-abschluss-grund-text">
                <strong>{g.label}</strong>
                <span>{g.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <label className="fall-abschluss-note-label">
          <span>
            Bemerkung
            {needsNote ? ' (erforderlich)' : ' (optional)'}
          </span>
          <textarea
            className="fall-abschluss-note"
            rows={2}
            maxLength={280}
            placeholder={
              selected
                ? `z. B. ${selected.hint}`
                : 'Kurze Notiz für das Team…'
            }
            value={bemerkung}
            disabled={pending}
            onChange={(e) => setBemerkung(e.target.value)}
          />
        </label>

        {error && (
          <p className="fall-abschluss-error" role="alert">
            {error}
          </p>
        )}

        <footer className="fall-abschluss-actions">
          <button
            type="button"
            className="btn-ghost"
            disabled={pending}
            onClick={onClose}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="fall-abschluss-submit"
            disabled={!canSubmit}
            onClick={() => {
              if (!grund) return;
              onConfirm(grund, bemerkung.trim() || undefined);
            }}
          >
            {pending ? 'Wird gespeichert…' : 'Fall abschließen'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
