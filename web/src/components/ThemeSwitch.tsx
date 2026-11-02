import { useTheme, type AppTheme } from '../theme/ThemeProvider';

export function ThemeSwitch({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={`theme-switch ${className}`.trim()}
      role="group"
      aria-label="Darstellung wählen"
    >
      {(['monitoring', 'alamida'] as AppTheme[]).map((t) => (
        <button
          key={t}
          type="button"
          className={`theme-switch-btn ${theme === t ? 'active' : ''}`}
          aria-pressed={theme === t}
          onClick={() => setTheme(t)}
        >
          {t === 'monitoring' ? 'Monitoring' : 'Alamida'}
        </button>
      ))}
    </div>
  );
}
