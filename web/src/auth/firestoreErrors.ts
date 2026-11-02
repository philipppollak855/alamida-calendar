import { FirebaseError } from 'firebase/app';

/** Firestore/Firebase-Fehler, die oft durch abgelaufene ID-Tokens entstehen. */
export function isFirestoreAuthError(err: unknown): boolean {
  if (!(err instanceof FirebaseError)) return false;
  const code = err.code;
  if (code === 'permission-denied' || code === 'unauthenticated') return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('authentication') ||
    msg.includes('unauthenticated') ||
    msg.includes('permission') ||
    msg.includes('insufficient permissions')
  );
}

export function normalizeFirestoreError(err: unknown): string {
  if (err instanceof FirebaseError) {
    if (isFirestoreAuthError(err)) {
      return 'Sitzung abgelaufen — Verbindung wird wiederhergestellt…';
    }
    if (err.code === 'unavailable' || err.code === 'deadline-exceeded') {
      return 'Netzwerk vorübergehend nicht erreichbar — wird erneut versucht…';
    }
  }
  return err instanceof Error ? err.message : 'Unbekannter Fehler';
}
