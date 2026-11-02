type Props = {
  erledigt?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function WallUeberfuehrungErledigtBtn({ erledigt, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      className={`wall-erledigt-btn${erledigt ? ' is-erledigt' : ''}`}
      disabled={disabled}
      title={erledigt ? 'Erledigung zurücknehmen' : 'Als erledigt markieren'}
      onClick={onClick}
    >
      {erledigt ? 'Erledigt ✓' : 'Erledigt'}
    </button>
  );
}
