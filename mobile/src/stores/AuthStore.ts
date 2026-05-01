import { create } from 'zustand';
import type { Session, User, Subscription, AuthError } from '@supabase/supabase-js';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase, isSupabaseConfigured } from '../services/supabase';

export type AuthState = 'init' | 'loading' | 'logged_in' | 'logged_out' | 'error';

interface AuthStore {
  session: Session | null;
  user: User | null;
  state: AuthState;
  error: string | null;
  _authSubscription: Subscription | null;

  initialize: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  cleanup: () => void;
}

function formatAuthError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as AuthError).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  session: null,
  user: null,
  state: 'init',
  error: null,
  _authSubscription: null,

  initialize: async () => {
    get().cleanup();

    if (!isSupabaseConfigured) {
      set({
        state: 'logged_in',
        session: null,
        user: null,
        error: null,
        _authSubscription: null,
      });
      return;
    }

    GoogleSignin.configure({
      webClientId: '865599262139-mla1l0bqc3ss0frq085mcdpd6cbftvem.apps.googleusercontent.com',
      iosClientId: '865599262139-dmfkvddphs7h1qu6dvrgj0t9aq656h84.apps.googleusercontent.com',
    });

    set({ state: 'loading', error: null });
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      set({
        session,
        user: session?.user ?? null,
        state: session ? 'logged_in' : 'logged_out',
        error: null,
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, newSession) => {
        set({
          session: newSession,
          user: newSession?.user ?? null,
          state: newSession ? 'logged_in' : 'logged_out',
          error: null,
        });
      });

      set({ _authSubscription: subscription });
    } catch (error: unknown) {
      set({
        state: 'error',
        error: formatAuthError(error, 'Failed to initialize authentication'),
        session: null,
        user: null,
      });
    }
  },

  signInWithGoogle: async () => {
    set({ state: 'loading', error: null });
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      if (!response.data?.idToken) {
        throw new Error('No ID token returned from Google Sign-In');
      }

      console.log('[AUTH] Got Google ID token, exchanging with Supabase...');
      const { data: sessionData, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.data.idToken,
        nonce: '',
      });

      if (error) {
        throw error;
      }

      set({
        session: sessionData.session,
        user: sessionData.user,
        state: sessionData.session ? 'logged_in' : 'logged_out',
        error: null,
      });
    } catch (error: unknown) {
      set({
        state: 'error',
        error: formatAuthError(error, 'Failed to sign in with Google'),
      });
    }
  },

  signOut: async () => {
    set({ state: 'loading', error: null });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      set({
        session: null,
        user: null,
        state: 'logged_out',
        error: null,
      });
    } catch (error: unknown) {
      set({
        state: 'error',
        error: formatAuthError(error, 'Failed to sign out'),
      });
    }
  },

  clearError: () => set({ error: null }),

  cleanup: () => {
    const subscription = get()._authSubscription;
    if (subscription) {
      subscription.unsubscribe();
      set({ _authSubscription: null });
    }
  },
}));
