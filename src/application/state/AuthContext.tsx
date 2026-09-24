import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../../infrastructure/api/supabaseClient';
import { SupabaseAuthRepository } from '../../infrastructure/database/SupabaseAuthRepository';
import type { AuthState, AuthUser } from '../../domain/repositories/IAuthRepository';

// Required for iOS to properly close the browser after OAuth
WebBrowser.maybeCompleteAuthSession();

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

type AuthContextValue = {
  authState: AuthState;
  user: AuthUser | null;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
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

  // Listen to auth changes (including the INITIAL_SESSION after AsyncStorage loads)
  useEffect(() => {
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
    try {
      await repo.signUp(email, password);
    } catch (err) {
      setAuthState({ status: 'unauthenticated' });
      throw err;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthState({ status: 'loading' });
    try {
      await repo.signIn(email, password);
    } catch (err) {
      setAuthState({ status: 'unauthenticated' });
      throw err;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthState({ status: 'loading' });
    try {
      // Build the redirect URI that Supabase will send the user back to
      const redirectTo = makeRedirectUri({ scheme: 'finvolt', path: 'auth/callback' });
      
      // TEMPORARY: Alert the exact redirect URI so the user can configure Supabase
      console.log('EXACT REDIRECT URI:', redirectTo);

      // Get the Google OAuth URL from Supabase
      const { url } = await repo.signInWithGoogle(redirectTo);

      // Open the browser — on success it returns the redirect URL with tokens
      const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);

      if (result.type !== 'success') {
        // User cancelled — go back to unauthenticated without error
        setAuthState({ status: 'unauthenticated' });
        return;
      }

      // Parse tokens from the redirect URL and create a session
      await repo.handleOAuthCallback(result.url);
      // state is handled by onAuthStateChange
    } catch (err) {
      setAuthState({ status: 'unauthenticated' });
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthState({ status: 'loading' });
    await repo.signOut();
    setAuthState({ status: 'unauthenticated' });
  }, []);

  const user = authState.status === 'authenticated' ? authState.user : null;

  return (
    <AuthContext.Provider value={{ authState, user, signUp, signIn, signInWithGoogle, signOut }}>
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
