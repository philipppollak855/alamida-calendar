import { useState } from 'react';
import { istFreigabeWirksam } from '../board/freigabeLogic';

function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoToDe(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

interface Props {
  docId: string;
  freigabeFrei?: boolean;
  freigabeDatum?: string;
  disabled?: boolean;
  defaultDate: Date;
  onSave: (docId: string, datumDe: string) => Promise<void>;
  onClear: (docId: string) => Promise<void>;
}

export function WallFreigabeControl({
  docId,
  freigabeFrei,
  freigabeDatum,
  disabled,
  defaultDate,
  onSave,
  onClear,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [iso, setIso] = useState(() => isoFromDate(defaultDate));
  const [busy, setBusy] = useState(false);

  if (freigabeFrei) {
    const wirksam = istFreigabeWirksam(freigabeFrei, freigabeDatum, defaultDate);
    return (
      <button
        type="button"
        className={`wall-freigabe-btn ${wirksam ? 'is-frei' : 'is-frei-geplant'}`}
        disabled={disabled || busy}
        title={
          wirksam
            ? `Freigabe ${freigabeDatum ?? ''} — tippen zum Zurücksetzen`
            : `Freigabe ab ${freigabeDatum ?? ''} — tippen zum Zurücksetzen`
        }
        onClick={() => {
          setBusy(true);
          void onClear(docId).finally(() => setBusy(false));
        }}
      >
        {busy ? '…' : freigabeDatum ?? 'Frei'}
      </button>
    );
  }

  if (editing) {
    return (
      <div className="wall-freigabe-edit">
        <input
          type="date"
          className="wall-freigabe-date"
          value={iso}
          disabled={disabled || busy}
          onChange={(e) => setIso(e.target.value)}
          aria-label="Freigabedatum"
        />
        <button
          type="button"
          className="wall-freigabe-ok"
          disabled={disabled || busy || !iso}
          onClick={() => {
            setBusy(true);
            void onSave(docId, isoToDe(iso)).finally(() => {
              setBusy(false);
              setEditing(false);
            });
          }}
        >
          {busy ? '…' : 'OK'}
        </button>
        <button
          type="button"
          className="wall-freigabe-cancel"
          disabled={busy}
          onClick={() => setEditing(false)}
          aria-label="Abbrechen"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="wall-freigabe-btn is-offen"
      disabled={disabled}
      title="Freigabedatum eintragen"
      onClick={() => {
        setIso(isoFromDate(defaultDate));
        setEditing(true);
      }}
    >
      Freigabe
    </button>
  );
}
