import { create } from "zustand";
import log from "loglevel";
import { supabase } from "../lib/supabaseClient"; // Import Supabase client
import type { Session, User, Provider } from "@supabase/supabase-js"; // Import Supabase types
import { isLocalhost } from "./ApiClient"; // Keep isLocalhost for potential dev bypass

// Define Supabase provider types supported by the application
export type OAuthProviderSupabase = Extract<Provider, "google" | "facebook">;

// Supabase subscription type from @supabase/supabase-js
type SupabaseSubscription = {
  unsubscribe: () => void;
};

/**
 * Interface defining the structure of the authentication Zustand store.
 */
export interface LoginStore {
  /** The current Supabase session object, or null if not logged in. */
  session: Session | null;
  /** The current Supabase user object derived from the session, or null. */
  user: User | { id: string } | null;
  /** The current state of the authentication process. */
  state: "init" | "loading" | "error" | "logged_in" | "logged_out";
  /** Stores the error message if an authentication operation fails. */
  error: string | null;
  /** Internal subscription to auth state changes for cleanup. */
  _authSubscription: SupabaseSubscription | null;
  /** Initiates the OAuth sign-in flow with the specified provider. */
  signInWithProvider: (provider: OAuthProviderSupabase) => Promise<void>;
  /** Signs the current user out. */
  signOut: () => Promise<void>;
  /** Initializes the auth store, checking for existing sessions and setting up listeners. */
  initialize: () => Promise<void>;
  /** Cleans up the auth subscription to prevent memory leaks. */
  cleanup: () => void;
}

/**
 * Zustand store for managing Supabase authentication state.
 *
 * Handles user session, login/logout operations, and listens for authentication state changes.
 * Automatically initializes upon application load.
 *
 * IMPORTANT: This store manages a Supabase subscription that must be cleaned up to prevent
 * memory leaks. The subscription is automatically unsubscribed when the user signs out
 * or when cleanup() is called.
 */
export const useAuth = create<LoginStore>((set, get) => ({
  session: null,
  user: null,
  state: "init",
  error: null,
  _authSubscription: null,

  /**
   * Cleanup function to unsubscribe from auth state changes.
   * Should be called when the application unmounts or when resetting auth state.
   */
  cleanup: () => {
    const subscription = get()._authSubscription;
    if (subscription) {
      subscription.unsubscribe();
      set({ _authSubscription: null });
      log.info("Auth: Subscription cleaned up");
    }
  },

  /**
   * Initializes the authentication state.
   * - Checks for an existing Supabase session on load.
   * - Sets up `onAuthStateChange` listener to react to login/logout events.
   * - Bypasses Supabase check if `isLocalhost` is true for development convenience.
   */
  initialize: async () => {
    log.info("Auth: Initializing...");

    // Clean up any existing subscription before initializing
    get().cleanup();

    if (isLocalhost) {
      // Provide a predictable state for local development without requiring login
      log.info("Auth: Running in localhost mode, setting state to logged_in.");
      set({
        state: "logged_in", // Assume logged in for local dev
        session: null,
        user: {
          id: "1"
        },
        error: null,
        _authSubscription: null
      });
      return;
    }

    set({ state: "loading" });
    try {
      // Check initial session state from Supabase
      const {
        data: { session },
        error
      } = await supabase.auth.getSession();

      if (error)
        {throw new Error("Failed to get initial session: " + error.message);}

      set({
        session,
        user: session?.user ?? null,
        state: session ? "logged_in" : "logged_out",
        error: null,
        _authSubscription: null
      });
      log.info(
        "Auth: Initial session checked.",
        session ? "Found" : "Not found"
      );

      // Subscribe to auth state changes and store the subscription for cleanup
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        log.info(
          "Auth: State Change Event -",
          event,
          "; Session:",
          session ? "Exists" : "Null"
        );
        set({
          session,
          user: session?.user ?? null,
          state: session ? "logged_in" : "logged_out",
          error: null
        });
      });

      // Store subscription reference for cleanup
      set({ _authSubscription: subscription });
    } catch (error: unknown) {
      log.info("Auth: Initialization error", error);
      set({
        state: "error",
        error: error instanceof Error ? error.message : "Auth initialization failed",
        session: null,
        user: null,
        _authSubscription: null
      });
    }
  },

  /**
   * Initiates the OAuth sign-in flow with the specified provider using Supabase.
   * Handles the redirect to the provider's login page.
   *
   * @param provider The OAuth provider (e.g., 'google').
   */
  signInWithProvider: async (provider: OAuthProviderSupabase) => {
    set({ state: "loading", error: null });
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          // URL to redirect to after successful authentication
          // Must be added to your Supabase project's redirect allow list.
          redirectTo: window.location.origin + "/dashboard"
        }
      });
      if (error) {throw error;}
      // State update (to 'logged_in') is handled by the onAuthStateChange listener.
    } catch (error: unknown) {
      log.info(`Auth: Sign in with ${provider} error`, error);
      set({
        state: "error",
        error: error instanceof Error ? error.message : `Failed to sign in with ${provider}`
      });
    }
  },

  /**
   * Signs the user out using Supabase.
   */
  signOut: async () => {
    set({ state: "loading", error: null });
    try {
      // Clean up subscription before signing out
      get().cleanup();

      const { error } = await supabase.auth.signOut();
      if (error) {throw error;}
      // Explicitly set state to logged_out here, although onAuthStateChange
      // will also fire and update the state.
      set({ session: null, user: null, state: "logged_out", error: null });
    } catch (error: unknown) {
      log.info("Auth: Sign out error", error);
      set({
        state: "error",
        error: error instanceof Error ? error.message : "Failed to sign out",
        session: null,
        user: null
      });
    }
  }
}));

export default useAuth;
