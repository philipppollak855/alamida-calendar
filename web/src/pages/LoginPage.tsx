import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ThemeSwitch } from '../components/ThemeSwitch';

export function LoginPage() {
  const { status, signInWithGoogle, error } = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/wall';

  if (status === 'activated') {
    return <Navigate to={from} replace />;
  }

  if (status === 'pending_activation') {
    return <Navigate to="/pending" replace />;
  }

  async function handleLogin() {
    setBusy(true);
    setLocalError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-theme-bar">
        <ThemeSwitch />
      </div>
      <div className="auth-card">
        <h1>Alamida Monitoring</h1>
        <p className="auth-lead">
          Disposition und Wandmonitor — nur für freigeschaltete Benutzer nach Anmeldung
          mit Google.
        </p>
        <button
          type="button"
          className="btn-google"
          onClick={handleLogin}
          disabled={busy || status === 'loading'}
        >
          {busy ? 'Wird angemeldet…' : 'Mit Google anmelden'}
        </button>
        {(localError || error) && (
          <p className="auth-error">{localError ?? error}</p>
        )}
        <p className="auth-hint small muted">
          Neues Konto: Nach der ersten Anmeldung muss ein Administrator Sie in der
          Firebase Console unter <strong>users</strong> aktivieren (
          <code>activated: true</code>).
        </p>
      </div>
    </div>
  );
}
