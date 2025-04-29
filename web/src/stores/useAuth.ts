import { create } from "zustand";
import log from "loglevel";
import { createErrorMessage } from "../utils/errorHandling";
import { supabase } from "../lib/supabaseClient"; // Import Supabase client
import type { Session, User, Provider } from "@supabase/supabase-js"; // Import Supabase types
import { isLocalhost } from "./ApiClient"; // Keep isLocalhost for potential dev bypass

// Define Supabase provider types supported by the application
export type OAuthProviderSupabase = Extract<Provider, "google" | "facebook">;

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
  /** Initiates the OAuth sign-in flow with the specified provider. */
  signInWithProvider: (provider: OAuthProviderSupabase) => Promise<void>;
  /** Signs the current user out. */
  signOut: () => Promise<void>;
  /** Initializes the auth store, checking for existing sessions and setting up listeners. */
  initialize: () => Promise<void>;
}

/**
 * Zustand store for managing Supabase authentication state.
 *
 * Handles user session, login/logout operations, and listens for authentication state changes.
 * Automatically initializes upon application load.
 */
export const useAuth = create<LoginStore>((set, get) => ({
  session: null,
  user: null,
  state: "init",
  error: null,

  /**
   * Initializes the authentication state.
   * - Checks for an existing Supabase session on load.
   * - Sets up `onAuthStateChange` listener to react to login/logout events.
   * - Bypasses Supabase check if `isLocalhost` is true for development convenience.
   */
  initialize: async () => {
    log.info("Auth: Initializing...");
    if (isLocalhost) {
      // Provide a predictable state for local development without requiring login
      log.info("Auth: Running in localhost mode, setting state to logged_in.");
      set({
        state: "logged_in", // Assume logged in for local dev
        session: null,
        user: {
          id: "1"
        },
        error: null
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
        throw new Error("Failed to get initial session: " + error.message);

      set({
        session,
        user: session?.user ?? null,
        state: session ? "logged_in" : "logged_out",
        error: null
      });
      log.info(
        "Auth: Initial session checked.",
        session ? "Found" : "Not found"
      );

      // Listen for subsequent auth state changes (login, logout, token refresh)
      supabase.auth.onAuthStateChange((event, session) => {
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
      // Note: The subscription returned by onAuthStateChange is not explicitly
      // unsubscribed here, as the auth store is typically global and persists
      // for the application's lifetime.
    } catch (error: any) {
      log.info("Auth: Initialization error", error);
      set({
        state: "error",
        error: createErrorMessage(error, "Auth initialization failed").message,
        session: null,
        user: null
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
          redirectTo: window.location.origin + "/editor/start"
        }
      });
      if (error) throw error;
      // State update (to 'logged_in') is handled by the onAuthStateChange listener.
    } catch (error: any) {
      log.info(`Auth: Sign in with ${provider} error`, error);
      set({
        state: "error",
        error: createErrorMessage(error, `Failed to sign in with ${provider}`)
          .message
      });
    }
  },

  /**
   * Signs the user out using Supabase.
   */
  signOut: async () => {
    set({ state: "loading", error: null });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // Explicitly set state to logged_out here, although onAuthStateChange
      // will also fire and update the state.
      set({ session: null, user: null, state: "logged_out", error: null });
    } catch (error: any) {
      log.info("Auth: Sign out error", error);
      // If sign-out fails, remain in an error state but clear session/user
      set({
        state: "error",
        error: createErrorMessage(error, "Failed to sign out").message,
        session: null,
        user: null
      });
    }
  }
}));

export default useAuth;
