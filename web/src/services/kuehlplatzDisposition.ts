import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

export type KuehlplatzMove = {
  docId: string;
  kuehlraumId: string;
  platz: number;
};

/** Manuelle Platz-Zuordnung in der Disposition (Alamida unverändert). */
export async function applyKuehlplatzMoves(moves: KuehlplatzMove[]): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  if (moves.length === 0) return;

  const batch = writeBatch(db);
  for (const m of moves) {
    if (m.platz < 1) throw new Error('Ungültiger Platz');
    batch.update(doc(db, 'sterbefaelle', m.docId), {
      kuehlplatzDisposition: String(m.platz),
      kuehlraumIdDisposition: m.kuehlraumId,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function clearKuehlplatzDisposition(docId: string): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const batch = writeBatch(db);
  batch.update(doc(db, 'sterbefaelle', docId), {
    kuehlplatzDisposition: '',
    kuehlraumIdDisposition: '',
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
