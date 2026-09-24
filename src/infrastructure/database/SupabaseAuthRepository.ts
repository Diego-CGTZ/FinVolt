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
