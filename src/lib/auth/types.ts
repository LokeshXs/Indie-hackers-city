import type { User } from "@supabase/supabase-js";

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextValue extends AuthState {
  signInWithGoogle: (returnTo: string) => Promise<void>;
  signOut: () => Promise<void>;
}
