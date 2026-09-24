import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../../infrastructure/api/supabaseClient';
import { SupabaseAuthRepository } from '../../infrastructure/database/SupabaseAuthRepository';
import type { AuthState, AuthUser } from '../../domain/repositories/IAuthRepository';

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

type AuthContextValue = {
  authState: AuthState;
  user: AuthUser | null;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

const repo = new SupabaseAuthRepository();

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' });

  // Resolve initial session on mount and listen to auth changes
  useEffect(() => {
    // Load existing session
    repo.getSession().then((user) => {
      setAuthState(user ? { status: 'authenticated', user } : { status: 'unauthenticated' });
    });

    // Listen to Supabase auth state changes (token refresh, sign-out from another tab, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const user: AuthUser = { id: session.user.id, email: session.user.email ?? '' };
        setAuthState({ status: 'authenticated', user });
      } else {
        setAuthState({ status: 'unauthenticated' });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setAuthState({ status: 'loading' });
    const user = await repo.signUp(email, password);
    setAuthState({ status: 'authenticated', user });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthState({ status: 'loading' });
    const user = await repo.signIn(email, password);
    setAuthState({ status: 'authenticated', user });
  }, []);

  const signOut = useCallback(async () => {
    setAuthState({ status: 'loading' });
    await repo.signOut();
    setAuthState({ status: 'unauthenticated' });
  }, []);

  const user = authState.status === 'authenticated' ? authState.user : null;

  return (
    <AuthContext.Provider value={{ authState, user, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
