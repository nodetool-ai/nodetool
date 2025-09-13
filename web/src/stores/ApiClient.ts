import createClient, { type Middleware } from "openapi-fetch";
import { paths } from "../api.js"; // Generated from openapi-typescript
import { supabase } from "../lib/supabaseClient";
import log from "loglevel";
import { BASE_URL } from "./BASE_URL";
export { BASE_URL } from "./BASE_URL";

/**
 * Checks if the current hostname indicates a local development environment.
 * Includes common localhost variations and specific local IPs.
 */
export const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("dev.") ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "192.168.50.225");

/** Flag indicating a development environment (synonym for isLocalhost). */
export const isDevelopment = isLocalhost;
/** Flag indicating a production environment. */
export const isProduction = !isLocalhost;

// Expose production status globally for potential debugging or conditional logic
if (typeof window !== "undefined") {
  (window as any)["isProduction"] = isProduction;
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
