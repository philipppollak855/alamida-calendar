import { useCallback, useState } from 'react';
import type { Sterbefall } from '../types';
import type { EigenerKuehlraumConfig } from '../types/dispositionSettings';
import { applyKuehlplatzMoves } from '../services/kuehlplatzDisposition';
import { KuehlraumPlatzCard } from './KuehlraumPlatzCard';

type DragPayload = {
  docId: string;
  kuehlraumId: string;
  fromPlatz: number;
};

interface Props {
  cfg: EigenerKuehlraumConfig;
  slots: (Sterbefall | null)[];
  now: Date;
  lagerSearchActive: boolean;
  expandedKrKey: string | null;
  abschlussPendingId: string | null;
  matchFall: (fall: Sterbefall) => boolean;
  onToggleExpand: (key: string) => void;
  onAbschliessen: (fall: Sterbefall) => void;
}

export function KuehlraumPlatzGrid({
  cfg,
  slots,
  now,
  lagerSearchActive,
  expandedKrKey,
  abschlussPendingId,
  matchFall,
  onToggleExpand,
  onAbschliessen,
}: Props) {
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [dropPlatz, setDropPlatz] = useState<number | null>(null);
  const [movePending, setMovePending] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const handleDrop = useCallback(
    async (targetPlatz: number, occupant: Sterbefall | null) => {
      if (!drag || movePending) return;
      if (drag.kuehlraumId !== cfg.id) {
        setMoveError('Platzwechsel nur innerhalb desselben Kühlraums.');
        setDrag(null);
        setDropPlatz(null);
        return;
      }
      if (occupant?.id === drag.docId) {
        setDrag(null);
        setDropPlatz(null);
        return;
      }

      setMoveError(null);
      setMovePending(true);
      try {
        const moves = [
          { docId: drag.docId, kuehlraumId: cfg.id, platz: targetPlatz },
        ];
        if (occupant) {
          moves.push({
            docId: occupant.id,
            kuehlraumId: cfg.id,
            platz: drag.fromPlatz,
          });
        }
        await applyKuehlplatzMoves(moves);
      } catch (e) {
        setMoveError(e instanceof Error ? e.message : 'Verschieben fehlgeschlagen');
      } finally {
        setMovePending(false);
        setDrag(null);
        setDropPlatz(null);
      }
    },
    [cfg.id, drag, movePending]
  );

  return (
    <>
      {moveError && (
        <p className="board-inline-error kr-platz-move-error" role="alert">
          {moveError}
        </p>
      )}
      <div className="kr-platz-grid">
        {slots.map((fall, i) => {
          const platzNr = i + 1;
          const key = `${cfg.id}:${i}`;
          const matches = !lagerSearchActive || (fall ? matchFall(fall) : false);

          if (lagerSearchActive && fall && !matches) return null;
          if (!fall) {
            if (lagerSearchActive) return null;
            const isDrop = dropPlatz === platzNr;
            return (
              <div
                key={key}
                className={`kr-platz-card kr-platz-card--free ${isDrop ? 'is-drop-target' : ''}`}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  setDropPlatz(platzNr);
                }}
                onDragLeave={() => setDropPlatz((p) => (p === platzNr ? null : p))}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleDrop(platzNr, null);
                }}
              >
                <span className="kr-platz-nr">Platz {platzNr}</span>
                <span className="kr-platz-free-label">Frei</span>
              </div>
            );
          }

          const isDragging = drag?.docId === fall.id;
          const isDrop = dropPlatz === platzNr && drag != null && drag.docId !== fall.id;

          return (
            <div
              key={key}
              className={isDrop ? 'kr-platz-drop-wrap is-drop-target' : 'kr-platz-drop-wrap'}
              onDragOver={(e) => {
                if (!drag || drag.docId === fall.id) return;
                e.preventDefault();
                setDropPlatz(platzNr);
              }}
              onDragLeave={() => setDropPlatz((p) => (p === platzNr ? null : p))}
              onDrop={(e) => {
                e.preventDefault();
                void handleDrop(platzNr, fall);
              }}
            >
              <KuehlraumPlatzCard
                platzNr={platzNr}
                fall={fall}
                now={now}
                expanded={expandedKrKey === key || (lagerSearchActive && matches)}
                highlighted={lagerSearchActive && matches}
                pending={abschlussPendingId === fall.id || movePending}
                draggable={!movePending && abschlussPendingId !== fall.id}
                dragging={isDragging}
                onDragStart={() =>
                  setDrag({ docId: fall.id, kuehlraumId: cfg.id, fromPlatz: platzNr })
                }
                onDragEnd={() => {
                  setDrag(null);
                  setDropPlatz(null);
                }}
                onToggleExpand={() => onToggleExpand(key)}
                onAbschliessen={() => onAbschliessen(fall)}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
