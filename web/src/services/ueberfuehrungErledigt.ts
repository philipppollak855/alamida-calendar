import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function toggleUeberfuehrungErledigt(
  docId: string,
  zeile: number,
  currentZeilen: number[],
  erledigt: boolean
): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');

  const next = erledigt
    ? currentZeilen.filter((z) => z !== zeile)
    : [...currentZeilen.filter((z) => z !== zeile), zeile].sort((a, b) => a - b);

  const ref = doc(db, 'sterbefaelle', docId);
  await updateDoc(ref, { erledigteUeberfuehrungenZeilen: next });
}
