import {
  collection,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBackgroundKeepAlive } from './useBackgroundKeepAlive';
import { isWallRoute } from './isWallRoute';
import { useAuth } from '../auth/AuthContext';
import { isFirestoreAuthError, normalizeFirestoreError } from '../auth/firestoreErrors';
import { ensureFreshIdToken } from '../auth/sessionRefresh';
import { db } from '../firebase';

export function useFirestoreCollection<T extends { id: string }>(
  collectionName: string,
  orderField?: string,
  max = 200
) {
  const { status } = useAuth();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [authReconnectTick, setAuthReconnectTick] = useState(0);
  const queryRef = useRef<Query<DocumentData> | null>(null);
  const onWall = typeof window !== 'undefined' && isWallRoute();

  const pollFromServer = useCallback(async () => {
    const q = queryRef.current;
    if (!q || status !== 'activated') return;
    try {
      const snap = await getDocs(q);
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
      setLastSyncAt(new Date());
      setLoading(false);
      setError(null);
    } catch (err) {
      if (isFirestoreAuthError(err)) {
        const ok = await ensureFreshIdToken(true);
        if (ok) setAuthReconnectTick((t) => t + 1);
      }
    }
  }, [status]);

  useBackgroundKeepAlive(
    status === 'activated',
    () => {
      void ensureFreshIdToken(true);
      void pollFromServer();
    },
    {
      hiddenIntervalMs: onWall ? 12_000 : 45_000,
      visibleIntervalMs: 120_000,
    }
  );

  useEffect(() => {
    if (status !== 'activated') {
      setItems([]);
      setLoading(status === 'loading');
      setLastSyncAt(null);
      if (status === 'anonymous') setError(null);
      return;
    }

    if (!db) {
      setLoading(false);
      setError('Firebase nicht konfiguriert — VITE_FIREBASE_* in .env setzen');
      return;
    }

    setLoading(true);
    const ref = collection(db, collectionName);
    const q: Query<DocumentData> = orderField
      ? query(ref, orderBy(orderField, 'desc'), limit(max))
      : query(ref, limit(max));
    queryRef.current = q;

    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        setLastSyncAt(new Date());
        setLoading(false);
        setError(null);
      },
      (err) => {
        if (isFirestoreAuthError(err)) {
          setError(normalizeFirestoreError(err));
          void ensureFreshIdToken(true).then((ok) => {
            if (ok) setAuthReconnectTick((t) => t + 1);
          });
        } else {
          setError(normalizeFirestoreError(err));
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [collectionName, orderField, max, status, authReconnectTick]);

  return {
    items,
    loading,
    error,
    lastSyncAt,
    isLive: status === 'activated' && lastSyncAt != null && !error,
  };
}
