import type { ReactNode } from 'react';

interface Chip {
  id: string;
  label: string;
  count?: number;
}

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  chips?: Chip[];
  activeChip?: string;
  onChipChange?: (id: string) => void;
  resultCount?: number;
  totalCount?: number;
  extra?: ReactNode;
}

export function BoardToolbar({
  search,
  onSearchChange,
  placeholder = 'Name, Fall-Nr. oder Ort…',
  chips,
  activeChip,
  onChipChange,
  resultCount,
  totalCount,
  extra,
}: Props) {
  const showCount =
    totalCount != null &&
    resultCount != null &&
    (search.trim().length > 0 || (activeChip && activeChip !== 'alle'));

  return (
    <div className="board-toolbar">
      <div className="board-toolbar-search-wrap">
        <span className="board-toolbar-search-icon" aria-hidden>
          ⌕
        </span>
        <input
          type="search"
          className="board-toolbar-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Suchen"
          autoComplete="off"
          spellCheck={false}
        />
        {search.length > 0 && (
          <button
            type="button"
            className="board-toolbar-clear"
            aria-label="Suche löschen"
            onClick={() => onSearchChange('')}
          >
            ×
          </button>
        )}
      </div>

      {chips && chips.length > 0 && onChipChange && (
        <div className="board-toolbar-chips" role="tablist">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={activeChip === chip.id}
              className={`board-toolbar-chip ${activeChip === chip.id ? 'active' : ''}`}
              onClick={() => onChipChange(chip.id)}
            >
              {chip.label}
              {chip.count != null && chip.count > 0 && (
                <span className="board-toolbar-chip-count">{chip.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="board-toolbar-meta">
        {showCount && (
          <span className="board-toolbar-count">
            {resultCount} von {totalCount}
          </span>
        )}
        {extra}
      </div>
    </div>
  );
}
