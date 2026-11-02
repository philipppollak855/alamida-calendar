import { doc, getDoc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { isFirestoreAuthError, normalizeFirestoreError } from '../auth/firestoreErrors';
import { ensureFreshIdToken } from '../auth/sessionRefresh';
import { db } from '../firebase';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import type { DispositionSettings } from '../types/dispositionSettings';
import { isPublicWallPath } from '../config/publicWall';
import { useBackgroundKeepAlive } from '../hooks/useBackgroundKeepAlive';
import { isWallRoute } from '../hooks/isWallRoute';
import {
  mergeDispositionSettings,
  setDispositionSettings,
} from './dispositionSettingsStore';
import { normalizeDispositionSettings } from './settingsNormalize';
import { validateDispositionSettings } from './settingsValidation';

const SETTINGS_DOC = ['settings', 'disposition'] as const;

type SettingsContextValue = {
  settings: DispositionSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  saveSettings: (next: DispositionSettings) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const isPublicWallRoute =
    typeof window !== 'undefined' && isPublicWallPath(window.location.pathname);
  const canRead = status === 'activated' || isPublicWallRoute;
  const onWall = typeof window !== 'undefined' && isWallRoute();
  const [settings, setSettings] = useState<DispositionSettings>(DEFAULT_DISPOSITION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authReconnectTick, setAuthReconnectTick] = useState(0);

  const pollSettings = useCallback(async () => {
    if (!db || !canRead) return;
    const ref = doc(db, SETTINGS_DOC[0], SETTINGS_DOC[1]);
    try {
      const snap = await getDoc(ref);
      const merged = mergeDispositionSettings(
        snap.exists() ? (snap.data() as Partial<DispositionSettings>) : undefined
      );
      setSettings(merged);
      setDispositionSettings(merged);
      setLoading(false);
      setError(null);
    } catch (err) {
      if (!isPublicWallRoute && isFirestoreAuthError(err)) {
        setError(normalizeFirestoreError(err));
        const ok = await ensureFreshIdToken(true);
        if (ok) setAuthReconnectTick((t) => t + 1);
      }
    }
  }, [canRead, isPublicWallRoute]);

  useBackgroundKeepAlive(
    canRead,
    () => {
      if (status === 'activated') void ensureFreshIdToken(true);
      void pollSettings();
    },
    {
      hiddenIntervalMs: onWall ? 12_000 : 45_000,
      visibleIntervalMs: onWall ? 60_000 : 120_000,
    }
  );

  useEffect(() => {
    if (!canRead || !db) {
      setLoading(status === 'loading' && !isPublicWallRoute);
      if (!canRead) {
        setDispositionSettings(DEFAULT_DISPOSITION_SETTINGS);
        setSettings(DEFAULT_DISPOSITION_SETTINGS);
      }
      return;
    }

    setLoading(true);
    const ref = doc(db, SETTINGS_DOC[0], SETTINGS_DOC[1]);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const merged = mergeDispositionSettings(
          snap.exists() ? (snap.data() as Partial<DispositionSettings>) : undefined
        );
        setSettings(merged);
        setDispositionSettings(merged);
        setLoading(false);
        setError(null);
      },
      (err) => {
        if (!isPublicWallRoute && isFirestoreAuthError(err)) {
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
  }, [status, authReconnectTick, canRead, isPublicWallRoute]);

  const saveSettings = useCallback(async (next: DispositionSettings) => {
    if (!db) throw new Error('Firebase nicht konfiguriert');
    const normalized = normalizeDispositionSettings(next);
    const validation = validateDispositionSettings(normalized);
    if (!validation.ok) {
      const msg = validation.errors.join(' ');
      setError(msg);
      throw new Error(msg);
    }
    setSaving(true);
    setError(null);
    try {
      const ref = doc(db, SETTINGS_DOC[0], SETTINGS_DOC[1]);
      const updatedAt = Timestamp.now();
      const payload = {
        ...normalized,
        updatedAt,
        settingsVersion: updatedAt.seconds,
      };
      await setDoc(ref, payload, { merge: true });
      const merged = mergeDispositionSettings(payload);
      setSettings(merged);
      setDispositionSettings(merged);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Speichern fehlgeschlagen';
      setError(msg);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const value = useMemo(
    () => ({ settings, loading, saving, error, saveSettings }),
    [settings, loading, saving, error, saveSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useDispositionSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useDispositionSettings nur innerhalb SettingsProvider');
  return ctx;
}
