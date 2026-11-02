import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { FallAbschlussGrund } from '../board/fallAbschluss';
import { isFallAbschlussGrund } from '../board/fallAbschluss';

/** Fall fachlich abschließen — verschwindet aus Kühlraum, Board und Wand. */
export async function abschliessenSterbefall(
  docId: string,
  grund: FallAbschlussGrund,
  bemerkung?: string,
  sterbefallId?: string
): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  if (!isFallAbschlussGrund(grund)) throw new Error('Ungültiger Abschlussgrund');

  const note = bemerkung?.trim();
  const ref = doc(db, 'sterbefaelle', docId);
  await updateDoc(ref, {
    inHistory: true,
    aktivInDisposition: false,
    historieGrund: grund,
    abschlussGrund: grund,
    ...(note ? { abschlussBemerkung: note } : {}),
    abgeschlossenAm: serverTimestamp(),
    archiviertAm: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(sterbefallId ? { sterbefallId } : {}),
  });
}
