import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/** Fall in Disposition/Wandmonitor ausblenden (z. B. Testfälle). Daten bleiben in Firestore. */
export async function removeSterbefallFromDisposition(
  docId: string,
  sterbefallId?: string
): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');

  const ref = doc(db, 'sterbefaelle', docId);
  await updateDoc(ref, {
    inHistory: true,
    aktivInDisposition: false,
    historieGrund: 'manuell_entfernt',
    archiviertAm: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(sterbefallId ? { sterbefallId } : {}),
  });
}
