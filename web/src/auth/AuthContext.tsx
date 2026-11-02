import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';
import type { AppUserProfile, AuthGateStatus } from './types';

export interface AuthContextValue {
  user: User | null;
  profile: AppUserProfile | null;
  status: AuthGateStatus;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth nur innerhalb von AuthProvider');
  return ctx;
}
