import { create } from 'zustand';
import type { Session, User, Subscription, AuthError, Provider } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase, isSupabaseConfigured } from '../services/supabase';

export type AuthState = 'init' | 'loading' | 'logged_in' | 'logged_out' | 'error';

export type OAuthProvider = Extract<Provider, 'google'>;

interface AuthStore {
  session: Session | null;
  user: User | null;
  state: AuthState;
  error: string | null;
  /** Internal reference to the Supabase auth subscription for cleanup. */
  _authSubscription: Subscription | null;

  /** Load persisted session and subscribe to auth changes. */
  initialize: () => Promise<void>;
  /** Email + password sign in. */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** Email + password sign up. */
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  /** OAuth sign in via Supabase (opens an in-app browser). */
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  /** Sign the current user out. */
  signOut: () => Promise<void>;
  /** Clear any stored error message. */
  clearError: () => void;
  /** Unsubscribe from auth change events. */
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
    // Tear down any previous subscription before re-initializing.
    get().cleanup();

    if (!isSupabaseConfigured) {
      set({
        state: 'logged_out',
        session: null,
        user: null,
        error: null,
        _authSubscription: null,
      });
      return;
    }

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

  signInWithPassword: async (email: string, password: string) => {
    set({ state: 'loading', error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        throw error;
      }
      set({
        session: data.session,
        user: data.user,
        state: data.session ? 'logged_in' : 'logged_out',
        error: null,
      });
    } catch (error: unknown) {
      set({
        state: 'error',
        error: formatAuthError(error, 'Failed to sign in'),
      });
    }
  },

  signUpWithPassword: async (email: string, password: string) => {
    set({ state: 'loading', error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) {
        throw error;
      }
      // Supabase returns a null session here when email confirmation is required.
      if (data.session) {
        set({
          session: data.session,
          user: data.user,
          state: 'logged_in',
          error: null,
        });
      } else {
        set({
          state: 'logged_out',
          error: 'Check your email to confirm your account, then sign in.',
        });
      }
    } catch (error: unknown) {
      set({
        state: 'error',
        error: formatAuthError(error, 'Failed to sign up'),
      });
    }
  },

  signInWithOAuth: async (provider: OAuthProvider) => {
    set({ state: 'loading', error: null });
    try {
      const redirectTo = AuthSession.makeRedirectUri({
        scheme: 'nodetool',
        path: 'auth-callback',
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) {
        throw error;
      }
      if (!data?.url) {
        throw new Error('No authorization URL returned from Supabase');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== 'success' || !result.url) {
        // User cancelled or dismissed the browser.
        set({ state: get().session ? 'logged_in' : 'logged_out', error: null });
        return;
      }

      // Supabase returns tokens either in the URL fragment (#) or query (?).
      // `getQueryParams` handles both.
      const { params, errorCode } = QueryParams.getQueryParams(result.url);
      if (errorCode) {
        throw new Error(errorCode);
      }

      const accessToken = params.access_token;
      const refreshToken = params.refresh_token;
      if (!accessToken || !refreshToken) {
        throw new Error('Missing access or refresh token in OAuth callback');
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      if (sessionError) {
        throw sessionError;
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
        error: formatAuthError(error, `Failed to sign in with ${provider}`),
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
