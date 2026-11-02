import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { AuthContext, type AuthContextValue } from './AuthContext';
import { isFirestoreAuthError, normalizeFirestoreError } from './firestoreErrors';
import { ensureFreshIdToken } from './sessionRefresh';
import { useSessionKeepAlive } from './useSessionKeepAlive';
import type { AppUserProfile, AuthGateStatus } from './types';

const PROFILE_RETRY_MS = 2500;
const PROFILE_MAX_ATTEMPTS = 4;

async function loadOrRegisterProfile(user: User): Promise<AppUserProfile> {
  if (!db) throw new Error('Firestore nicht konfiguriert');

  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data() as AppUserProfile;
  }

  const profile: AppUserProfile = {
    email: user.email ?? '',
    displayName: user.displayName ?? undefined,
    photoURL: user.photoURL ?? undefined,
    activated: false,
    createdAt: { seconds: Math.floor(Date.now() / 1000) },
  };

  await setDoc(ref, {
    ...profile,
    createdAt: serverTimestamp(),
  });

  return profile;
}

async function loadProfileWithTokenRefresh(user: User): Promise<AppUserProfile> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < PROFILE_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await ensureFreshIdToken(true);
      await new Promise((r) => setTimeout(r, PROFILE_RETRY_MS));
    }
    try {
      return await loadOrRegisterProfile(user);
    } catch (e) {
      lastErr = e;
      if (!isFirestoreAuthError(e) && attempt >= 1) break;
    }
  }
  throw lastErr;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [status, setStatus] = useState<AuthGateStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const profileRef = useRef<AppUserProfile | null>(null);
  profileRef.current = profile;

  useSessionKeepAlive(status === 'activated' || status === 'pending_activation');

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    setError(null);
    const p = await loadProfileWithTokenRefresh(user);
    setProfile(p);
    setStatus(p.activated ? 'activated' : 'pending_activation');
  }, [user]);

  useEffect(() => {
    if (!auth) {
      setStatus('anonymous');
      setError('Firebase Auth nicht konfiguriert');
      return;
    }

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setStatus('anonymous');
        setError(null);
        return;
      }

      setUser(firebaseUser);
      setError(null);
      try {
        const p = await loadProfileWithTokenRefresh(firebaseUser);
        setProfile(p);
        setStatus(p.activated ? 'activated' : 'pending_activation');
      } catch (e) {
        const msg = normalizeFirestoreError(e);
        setError(msg);
        const prev = profileRef.current;
        if (prev?.activated) {
          setProfile(prev);
          setStatus('activated');
        } else if (prev) {
          setProfile(prev);
          setStatus('pending_activation');
        } else {
          setStatus('loading');
        }
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !error) return;
    const retry = () => {
      void refreshProfile().catch(() => {});
    };
    const t = window.setInterval(retry, 30_000);
    return () => window.clearInterval(t);
  }, [user, error, refreshProfile]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) throw new Error('Firebase Auth nicht konfiguriert');
    setError(null);
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      status,
      error,
      signInWithGoogle,
      signOut,
      refreshProfile,
    }),
    [user, profile, status, error, signInWithGoogle, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
