import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function markSterbefallUrnenRetour(
  docId: string,
  retourVon?: string
): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');

  const ref = doc(db, 'sterbefaelle', docId);
  await updateDoc(ref, {
    urnenBereich: true,
    urnenSeit: serverTimestamp(),
    retourVon: retourVon?.trim() || null,
  });
}

/** Rückgängig — Fall erscheint wieder unter Extern/Kremation. */
export async function clearSterbefallUrnenRetour(docId: string): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');

  const ref = doc(db, 'sterbefaelle', docId);
  await updateDoc(ref, {
    urnenBereich: false,
    urnenSeit: deleteField(),
    retourVon: deleteField(),
  });
}
