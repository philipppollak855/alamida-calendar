import {
  collection,
  limit,
  orderBy,
  query,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { istImAnschluss } from '../board/historieLogic';
import { db } from '../firebase';
import type { Sterbefall } from '../types';

export const STERBEFALLE_COLLECTION = 'sterbefaelle';
export const STERBEFALLE_ORDER_FIELD = 'lastSeenAt';
export const STERBEFALLE_MAX_DOCS = 200;

export function sterbefaelleQuery(): Query<DocumentData> | null {
  if (!db) return null;
  return query(
    collection(db, STERBEFALLE_COLLECTION),
    orderBy(STERBEFALLE_ORDER_FIELD, 'desc'),
    limit(STERBEFALLE_MAX_DOCS)
  );
}

export function mapSterbefallDocs(docs: QueryDocumentSnapshot<DocumentData>[]): Sterbefall[] {
  return docs.map((d) => {
    const raw = d.data();
    return {
      id: d.id,
      ...raw,
      imAnschluss:
        typeof raw.imAnschluss === 'boolean'
          ? raw.imAnschluss
          : istImAnschluss(String(raw.imAnschluss ?? '')),
    } as Sterbefall;
  });
}
