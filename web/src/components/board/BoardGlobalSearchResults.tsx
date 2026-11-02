import {
  boardSearchKindLabel,
  type BoardSearchHit,
} from '../../board/boardGlobalSearch';
import type { BoardSection } from '../../board/boardSections';

interface Props {
  hits: BoardSearchHit[];
  query: string;
  onOpen: (hit: BoardSearchHit) => void;
  onClear: () => void;
}

const KIND_ICON: Record<BoardSearchHit['kind'], string> = {
  kuehlraum: '❄',
  ueberfuehrung: '→',
  fall: '◎',
  urne: '◆',
};

export function BoardGlobalSearchResults({ hits, query, onOpen, onClear }: Props) {
  if (!query.trim()) return null;

  return (
    <section className="panel board-global-search">
      <div className="board-global-search-head">
        <div>
          <h2>Suchergebnisse</h2>
          <p>
            {hits.length === 0
              ? `Keine Treffer für „${query.trim()}“`
              : `${hits.length} Treffer für „${query.trim()}“`}
          </p>
        </div>
        <button type="button" className="btn-ghost btn-small" onClick={onClear}>
          Suche löschen
        </button>
      </div>

      {hits.length > 0 && (
        <ul className="board-global-search-list">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="board-global-search-item"
                onClick={() => onOpen(hit)}
              >
                <span className={`board-global-search-icon kind-${hit.kind}`} aria-hidden>
                  {KIND_ICON[hit.kind]}
                </span>
                <span className="board-global-search-body">
                  <span className="board-global-search-title">{hit.title}</span>
                  {hit.subtitle && (
                    <span className="board-global-search-sub">{hit.subtitle}</span>
                  )}
                </span>
                <span className="board-global-search-meta">
                  {hit.badge && <span className="board-global-search-badge">#{hit.badge}</span>}
                  <span className="board-global-search-kind">{boardSearchKindLabel(hit.kind)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="board-global-search-hint">
        Tipp: Enter auf einem Treffer öffnet den passenden Bereich mit aktiver Suche.
      </p>
    </section>
  );
}

export type { BoardSection };
