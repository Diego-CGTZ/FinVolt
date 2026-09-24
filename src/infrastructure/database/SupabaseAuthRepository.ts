import { supabase } from '../api/supabaseClient';
import type { AuthUser, IAuthRepository } from '../../domain/repositories/IAuthRepository';

/**
 * Supabase implementation of IAuthRepository.
 *
 * Maps Supabase Auth responses to the domain's AuthUser type,
 * keeping the presentation and application layers decoupled from Supabase specifics.
 */
export class SupabaseAuthRepository implements IAuthRepository {
  async signUp(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Sign up failed: no user returned');

    return { id: data.user.id, email: data.user.email ?? email };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Sign in failed: no user returned');

    return { id: data.user.id, email: data.user.email ?? email };
  }

  /**
   * Returns the Google OAuth URL. The caller opens it in a browser
   * and passes the resulting redirect URL to handleOAuthCallback.
   */
  async signInWithGoogle(redirectTo: string): Promise<{ url: string }> {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (error || !data.url) throw new Error(error?.message ?? 'Failed to get Google auth URL');

    return { url: data.url };
  }

  /**
   * After the browser redirects back, parse the URL hash to extract
   * the Supabase access/refresh tokens and establish a session.
   */
  async handleOAuthCallback(redirectUrl: string): Promise<AuthUser> {
    // Supabase returns tokens in the URL hash as query params
    const url = new URL(redirectUrl);

    // Try hash fragment first (implicit flow), then query params (PKCE)
    const hashParams = new URLSearchParams(url.hash.replace('#', ''));
    const queryParams = new URLSearchParams(url.search);

    const access_token = hashParams.get('access_token') ?? queryParams.get('access_token');
    const refresh_token = hashParams.get('refresh_token') ?? queryParams.get('refresh_token');

    if (!access_token || !refresh_token) {
      throw new Error('No tokens found in OAuth redirect URL');
    }

    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });

    if (error || !data.user) throw new Error(error?.message ?? 'Failed to set session');

    return { id: data.user.id, email: data.user.email ?? '' };
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async getSession(): Promise<AuthUser | null> {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.user) return null;

    const user = data.session.user;
    return { id: user.id, email: user.email ?? '' };
  }
}
