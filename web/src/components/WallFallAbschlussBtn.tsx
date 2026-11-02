interface Props {
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
}

export function WallFallAbschlussBtn({ disabled, pending, onClick }: Props) {
  return (
    <button
      type="button"
      className="wall-abschluss-btn"
      disabled={disabled || pending}
      title="Fall abschließen (z. B. Übergabe an anderen Bestatter)"
      onClick={onClick}
    >
      {pending ? '…' : 'Abschl.'}
    </button>
  );
}
