import { create } from 'zustand';
import type { Session, User, Subscription } from '@supabase/supabase-js';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  bindAuthRefreshToAppState,
  isSupabaseConfigured,
  supabase,
} from '../services/supabase';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../services/authConfig';
import { queryClient } from '../queryClient';
// documentStore → backends → trpc/client imports this store back. The cycle is
// safe: each side only reads the other inside functions, never at load time.
import { resetDocumentStores } from '../documents/documentStore';
import { isNonEmptyString, isRecord } from '../utils/typePredicates';

type AuthState = 'init' | 'loading' | 'logged_in' | 'logged_out' | 'error';

interface AuthStore {
  session: Session | null;
  user: User | null;
  state: AuthState;
  error: string | null;
  _authSubscription: Subscription | null;

  initialize: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Called when the session cannot be recovered: drop the local
   * session and cached state and route back to login, without a network
   * sign-out (the token is already invalid).
   */
  handleSessionExpired: () => void;
  /**
   * Called when the server rejects a request with 401: try one token refresh.
   * Resolves true with the new session stored, or false after dropping the
   * session through {@link handleSessionExpired}. Concurrent callers share one
   * refresh.
   */
  refreshSession: () => Promise<boolean>;
  clearError: () => void;
  cleanup: () => void;
}

/**
 * Clear all user-bound client state on logout/expiry so the next account
 * can't see the previous user's threads, messages, or cached queries.
 */
async function resetClientState(): Promise<void> {
  try {
    // Lazy import to avoid a circular dependency between auth and chat.
    const chatModule = await import('./ChatStore');
    const chatStore = chatModule.useChatStore;
    chatStore.getState().disconnect();
    chatStore.setState({
      threads: {},
      currentThreadId: null,
      messageCache: {},
      error: null,
    });
  } catch (err) {
    console.warn('[AuthStore] failed to reset chat state', err);
  }
  // Open documents hold the previous account's bodies and tokens.
  resetDocumentStores();
  queryClient.clear();
}

/** Removes the AppState → token auto-refresh binding made by `initialize`. */
let unbindAuthRefresh: (() => void) | null = null;

/** The refresh on the wire, shared by every request that hit a 401 meanwhile. */
let refreshInFlight: Promise<boolean> | null = null;

function formatAuthError(error: unknown, fallback: string): string {
  if (isRecord(error) && 'message' in error) {
    const message = error.message;
    if (isNonEmptyString(message)) {
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

    unbindAuthRefresh?.();
    unbindAuthRefresh = bindAuthRefreshToAppState();

    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
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
    } catch (error: unknown) {
      // The global sign-out needs the network. Signing out must still work
      // offline, so drop the stored session on this device instead; the
      // refresh token simply expires server-side.
      console.warn('[AuthStore] remote sign-out failed, signing out locally', error);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (localError: unknown) {
        console.warn('[AuthStore] local sign-out failed', localError);
      }
    }

    // Tear down the auth listener and clear any user-bound chat/query state
    // so the next account can't see the previous user's data.
    get().cleanup();
    await resetClientState();

    set({
      session: null,
      user: null,
      state: 'logged_out',
      error: null,
    });
  },

  handleSessionExpired: () => {
    // Already signed out — nothing to do (and avoids re-entrant loops when
    // several in-flight requests all 401 at once).
    if (!get().session) {
      return;
    }
    console.warn('[AuthStore] session expired — clearing local session');
    get().cleanup();
    void resetClientState();
    set({
      session: null,
      user: null,
      state: 'logged_out',
      error: 'Your session expired. Please sign in again.',
    });
  },

  refreshSession: () => {
    if (refreshInFlight) {
      return refreshInFlight;
    }
    refreshInFlight = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session) {
          throw error ?? new Error('No session returned from refresh');
        }
        set({ session: data.session, user: data.session.user ?? null });
        return true;
      } catch (error: unknown) {
        console.warn('[AuthStore] token refresh failed', error);
        get().handleSessionExpired();
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
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
