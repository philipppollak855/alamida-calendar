import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/** Freigabe am Wandmonitor (Extern + Kühlraum) — ein Feld pro Sterbefall. */
export async function setSterbefallFreigabe(docId: string, datum: string): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');

  const ref = doc(db, 'sterbefaelle', docId);
  await updateDoc(ref, {
    freigabeFrei: true,
    freigabeDatum: datum.trim(),
    freigabeAm: serverTimestamp(),
  });
}

/** Freigabe zurücksetzen. */
export async function clearSterbefallFreigabe(docId: string): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');

  const ref = doc(db, 'sterbefaelle', docId);
  await updateDoc(ref, {
    freigabeFrei: false,
    freigabeDatum: deleteField(),
    freigabeAm: deleteField(),
  });
}
