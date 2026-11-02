import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ThemeSwitch } from '../components/ThemeSwitch';

export function PendingPage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleRefresh() {
    setBusy(true);
    try {
      await refreshProfile();
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
        <h1>Konto wartet auf Freischaltung</h1>
        <p className="auth-lead">
          Sie sind als <strong>{profile?.email ?? user?.email}</strong> angemeldet, haben aber
          noch keinen Zugriff auf Sterbefall-Daten.
        </p>
        <ol className="auth-steps">
          <li>Administrator öffnet Firebase Console → Firestore → Collection <code>users</code></li>
          <li>Dokument mit Ihrer UID: Feld <code>activated</code> auf <code>true</code> setzen</li>
          <li>Hier auf „Status prüfen“ klicken oder Seite neu laden</li>
        </ol>
        <div className="auth-actions">
          <button type="button" className="btn-primary" onClick={handleRefresh} disabled={busy}>
            {busy ? 'Prüfe…' : 'Status prüfen'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => signOut()}>
            Abmelden
          </button>
        </div>
        {user && (
          <p className="small muted auth-uid">
            UID (für Admin): <code>{user.uid}</code>
          </p>
        )}
      </div>
    </div>
  );
}
