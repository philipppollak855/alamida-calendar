import { getDocs, onSnapshot } from 'firebase/firestore';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { isFirestoreAuthError, normalizeFirestoreError } from '../auth/firestoreErrors';
import { ensureFreshIdToken } from '../auth/sessionRefresh';
import { db } from '../firebase';
import type { Sterbefall } from '../types';
import { isPublicWallPath } from '../config/publicWall';
import { useBackgroundKeepAlive } from '../hooks/useBackgroundKeepAlive';
import { isWallRoute } from '../hooks/isWallRoute';
import {
  mapSterbefallDocs,
  sterbefaelleQuery,
} from './sterbefaelleQuery';

type SterbefaelleContextValue = {
  items: Sterbefall[];
  loading: boolean;
  error: string | null;
  lastSyncAt: Date | null;
  isLive: boolean;
};

const SterbefaelleContext = createContext<SterbefaelleContextValue | null>(null);

/** Ein gemeinsamer onSnapshot für alle Seiten — vermeidet parallele Listener. */
export function SterbefaelleProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const isPublicWallRoute =
    typeof window !== 'undefined' && isPublicWallPath(window.location.pathname);
  const onWall = typeof window !== 'undefined' && isWallRoute();
  const canRead = status === 'activated' || isPublicWallRoute;
  const [items, setItems] = useState<Sterbefall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [authReconnectTick, setAuthReconnectTick] = useState(0);
  const pollFailCountRef = useRef(0);

  const applySnapshot = useCallback((mapped: Sterbefall[]) => {
    setItems(mapped);
    setLastSyncAt(new Date());
    setLoading(false);
    setError(null);
    pollFailCountRef.current = 0;
  }, []);

  const pollFromServer = useCallback(async () => {
    const q = sterbefaelleQuery();
    if (!q || !canRead) return;
    try {
      const snap = await getDocs(q);
      applySnapshot(mapSterbefallDocs(snap.docs));
    } catch (e) {
      pollFailCountRef.current += 1;
      if (isFirestoreAuthError(e) && status === 'activated') {
        const ok = await ensureFreshIdToken(true);
        if (ok) setAuthReconnectTick((t) => t + 1);
      }
      if (pollFailCountRef.current >= 2) {
        setError(normalizeFirestoreError(e));
        setAuthReconnectTick((t) => t + 1);
      }
    }
  }, [canRead, status, applySnapshot]);

  const syncLive = useCallback(() => {
    if (status === 'activated') void ensureFreshIdToken(true);
    void pollFromServer();
  }, [status, pollFromServer]);

  useBackgroundKeepAlive(canRead, syncLive, {
    hiddenIntervalMs: onWall ? 12_000 : 45_000,
    visibleIntervalMs: onWall ? 60_000 : 120_000,
  });

  useEffect(() => {
    if (!canRead) {
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

    const q = sterbefaelleQuery();
    if (!q) return;

    setLoading(true);
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        applySnapshot(mapSterbefallDocs(snap.docs));
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
  }, [status, authReconnectTick, canRead, applySnapshot]);

  const value = useMemo(
    (): SterbefaelleContextValue => ({
      items,
      loading,
      error,
      lastSyncAt,
      isLive: canRead && lastSyncAt != null && !error,
    }),
    [items, loading, error, lastSyncAt, canRead]
  );

  return (
    <SterbefaelleContext.Provider value={value}>{children}</SterbefaelleContext.Provider>
  );
}

export function useSterbefaelle(): SterbefaelleContextValue {
  const ctx = useContext(SterbefaelleContext);
  if (!ctx) {
    throw new Error('useSterbefaelle muss innerhalb von SterbefaelleProvider verwendet werden');
  }
  return ctx;
}
