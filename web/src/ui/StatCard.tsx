export function StatCard({
  label,
  value,
  hint,
  accent = 'default',
  onClick,
  active = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'default' | 'warn' | 'success' | 'accent' | 'violet';
  onClick?: () => void;
  active?: boolean;
}) {
  const className = [
    'stat-card',
    `stat-${accent}`,
    onClick ? 'stat-card--interactive' : '',
    active ? 'is-active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
