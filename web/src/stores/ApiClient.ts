import createClient, { type Middleware } from "openapi-fetch";
import { paths } from "../api.js"; // Generated from openapi-typescript
import { supabase } from "../lib/supabaseClient";
import log from "loglevel";
import { BASE_URL } from "./BASE_URL";
import { isElectron as browserIsElectron } from "../utils/browser";

/**
 * Checks if localhost mode should be forced.
 * Checks in order: environment variable, query parameter, localStorage.
 */
const getForcedLocalhost = (): boolean | null => {
  if (typeof window === "undefined") {
    return null;
  }

  // Check environment variable (build-time)
  const envForce = import.meta.env.VITE_FORCE_LOCALHOST;
  if (envForce === "true" || envForce === "1") {
    return true;
  }
  if (envForce === "false" || envForce === "0") {
    return false;
  }

  // Check query parameter (runtime override)
  const urlParams = new URLSearchParams(window.location.search);
  const queryForce = urlParams.get("forceLocalhost");
  if (queryForce === "true" || queryForce === "1") {
    return true;
  }
  if (queryForce === "false" || queryForce === "0") {
    return false;
  }

  // Check localStorage (persistent user preference)
  try {
    const stored = localStorage.getItem("forceLocalhost");
    if (stored === "true" || stored === "1") {
      return true;
    }
    if (stored === "false" || stored === "0") {
      return false;
    }
  } catch {
    // localStorage might not be available
  }

  return null;
};

/**
 * Checks if the current hostname indicates a local development environment.
 * Includes common localhost variations and specific local IPs.
 * Can be overridden via VITE_FORCE_LOCALHOST env var, ?forceLocalhost query param, or localStorage.
 */
export const isLocalhost = ((): boolean => {
  const forced = getForcedLocalhost();
  if (forced !== null) {
    return forced;
  }

  // Default behavior: check hostname
  return (
    typeof window !== "undefined" &&
    (window.location.hostname.includes("dev.") ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "192.168.50.225")
  );
})();

/** Flag indicating a development environment (synonym for isLocalhost). */
export const isDevelopment = isLocalhost;
/** Flag indicating a production environment. */
export const isProduction = !isLocalhost;

/** Flag indicating whether the app is running inside the Electron shell. */
export const isElectron = browserIsElectron;

/**
 * Programmatically set the force localhost preference in localStorage.
 * This will persist across page reloads.
 *
 * @param force - true to force localhost mode, false to force production mode, null to clear override
 */
export const setForceLocalhost = (force: boolean | null): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (force === null) {
      localStorage.removeItem("forceLocalhost");
    } else {
      localStorage.setItem("forceLocalhost", force ? "true" : "false");
    }
    // Reload page to apply changes
    window.location.reload();
  } catch (error) {
    log.warn("Failed to set forceLocalhost preference:", error);
  }
};

// Expose production status globally for potential debugging or conditional logic
if (typeof window !== "undefined") {
  (window as any)["isProduction"] = isProduction;
  (window as any)["isLocalhost"] = isLocalhost;
  (window as any)["isElectron"] = isElectron;
  (window as any)["setForceLocalhost"] = setForceLocalhost;
}

/**
 * Middleware for the openapi-fetch client to handle authentication.
 */
const authMiddleware: Middleware = {
  /**
   * Intercepts requests before they are sent.
   * Fetches the current Supabase session and adds the Authorization (Bearer token)
   * and apikey headers if a session exists.
   */
  async onRequest({ request }) {
    if (isLocalhost) {
      return request;
    }
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (session && request) {
      const token = session.access_token;
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
  /**
   * Intercepts responses after they are received.
   * If a 401 Unauthorized status is detected, it triggers a Supabase sign-out
   * and redirects the user to the login page.
   * Note: Supabase client handles token refreshes automatically.
   * This handler primarily deals with completely invalid/expired sessions.
   */
  async onResponse({ response }) {
    if (response?.status === 401 && window.location.pathname !== "/login") {
      log.warn("API request unauthorized (401).");
      // const {
      //   data: { session }
      // } = await supabase.auth.getSession();
      // if (session) {
      //   console.warn("API request unauthorized (401). Signing out.");
      //   // Attempt to sign out via Supabase
      //   await supabase.auth.signOut();
      //   if (typeof window !== "undefined") {
      //     window.location.href = "/login";
      //   }
      // }
    }
    return response;
  }
};

/**
 * The configured openapi-fetch client instance for making API calls.
 * Includes the base URL and authentication middleware.
 */
export const client = createClient<paths>({
  baseUrl: BASE_URL
});

// Apply the authentication middleware to the client instance
client.use(authMiddleware);

/**
 * Asynchronously generates an object containing the necessary authentication headers
 * (Authorization Bearer token and apikey) based on the current Supabase session.
 * Returns an empty object if no session exists.
 * Useful for manual fetch/axios requests that don't use the main `client`.
 *
 * @returns {Promise<Record<string, string>>} A promise resolving to the headers object.
 */
export const authHeader = async (): Promise<{ [key: string]: string }> => {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const headers: { [key: string]: string } = {};

  if (session) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  return headers;
};
