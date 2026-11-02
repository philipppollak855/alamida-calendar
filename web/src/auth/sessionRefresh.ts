import { auth } from '../firebase';

/** ID-Token erneuern (Firebase rotiert Tokens ca. alle 60 Minuten). */
export async function ensureFreshIdToken(force = false): Promise<boolean> {
  const user = auth?.currentUser;
  if (!user) return false;
  try {
    await user.getIdToken(force);
    return true;
  } catch {
    return false;
  }
}
