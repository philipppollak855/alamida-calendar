export interface AppUserProfile {
  email: string;
  displayName?: string;
  photoURL?: string;
  activated: boolean;
  createdAt?: { seconds: number };
  activatedAt?: { seconds: number };
}

export type AuthGateStatus =
  | 'loading'
  | 'anonymous'
  | 'pending_activation'
  | 'activated';
