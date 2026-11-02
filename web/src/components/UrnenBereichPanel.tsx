import type { UrnenEintrag } from '../board/urnenLogic';

type Props = {
  liste: UrnenEintrag[];
  pendingDocId: string | null;
  onUndo: (docId: string) => void;
  variant?: 'wall' | 'board';
  /** Horizontale Chip-Leiste (Lager) statt hoher Liste */
  compact?: boolean;
};

export function UrnenBereichPanel({
  liste,
  pendingDocId,
  onUndo,
  variant = 'board',
  compact = false,
}: Props) {
  if (liste.length === 0) return null;

  const isWall = variant === 'wall';
  const isCompactBoard = !isWall && compact;

  return (
    <section
      className={[
        isWall ? 'wall-urnen-section' : 'panel board-urnen-panel',
        isCompactBoard ? 'board-urnen-compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Urnen"
    >
      {isWall ? (
        <div className="wall-urnen-head">
          <h3 className="wall-urnen-title">Urnen</h3>
          <span className="wall-urnen-sub">Retour · {liste.length}</span>
        </div>
      ) : isCompactBoard ? (
        <div className="board-urnen-compact-head">
          <h2>Urnen</h2>
          <span className="board-urnen-compact-count">{liste.length} Retour</span>
        </div>
      ) : (
        <div className="panel-head compact">
          <div>
            <h2>Urnen</h2>
            <p>{liste.length} Retour aus Kremation</p>
          </div>
        </div>
      )}

      <ul
        className={[
          isWall ? 'wall-urnen-list' : 'board-urnen-list',
          isCompactBoard ? 'board-urnen-list--compact' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {liste.map((u) => (
          <li
            key={u.docId}
            className={[
              isWall ? 'wall-urnen-item' : 'board-urnen-item',
              isCompactBoard ? 'board-urnen-item--compact' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className={isWall ? 'wall-urnen-item-main' : 'board-urnen-item-main'}>
              <span className={isWall ? 'wall-urnen-name' : 'board-urnen-name'}>
                {u.name}
              </span>
              {u.retourVon && (
                <span className={isWall ? 'wall-urnen-meta' : 'board-urnen-meta'}>
                  {isCompactBoard ? u.retourVon : `von ${u.retourVon}`}
                </span>
              )}
            </div>
            <button
              type="button"
              className="urnen-undo-btn"
              disabled={pendingDocId === u.docId}
              title="Zurück nach Extern/Kremation"
              onClick={() => onUndo(u.docId)}
            >
              {pendingDocId === u.docId ? '…' : 'Rückgängig'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
