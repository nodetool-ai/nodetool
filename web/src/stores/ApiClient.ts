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
      window.location.hostname === "localhost")
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
 * Options for HTTP client requests.
 */
interface RequestOptions {
  params?: {
    path?: Record<string, string | number | boolean>;
    query?: Record<string, string | number | boolean | null | undefined>;
  };
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Result type returned by HTTP client methods.
 */
export type ClientResult<T = any> = {
  data: T | null | undefined;
  error: Record<string, any> | null | undefined;
};

/**
 * Builds a URL by replacing path parameters and appending query parameters.
 */
function buildUrl(
  baseUrl: string,
  path: string,
  options?: RequestOptions
): string {
  let url = path;

  // Replace path parameters (e.g., {id} -> actual value)
  if (options?.params?.path) {
    for (const [key, value] of Object.entries(options.params.path)) {
      url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
    }
  }

  // Append query parameters
  if (options?.params?.query) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params.query)) {
      if (value !== null && value !== undefined) {
        queryParams.append(key, String(value));
      }
    }
    const queryString = queryParams.toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  return baseUrl.replace(/\/$/, "") + url;
}

/**
 * Gets authentication headers for the current Supabase session.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  if (isLocalhost) {
    return {};
  }
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (session) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

/**
 * Performs an HTTP request and returns { data, error } result.
 */
async function request<T = any>(
  method: string,
  path: string,
  options?: RequestOptions
): Promise<ClientResult<T>> {
  const url = buildUrl(BASE_URL, path, options);
  const authHeaders = await getAuthHeaders();

  // Determine body and content-type
  let body: BodyInit | undefined;
  const headers: Record<string, string> = {
    ...authHeaders,
    ...options?.headers
  };

  if (options?.body !== undefined) {
    if (options.body instanceof FormData) {
      body = options.body;
      // Don't set Content-Type for FormData (browser sets it with boundary)
    } else {
      body = JSON.stringify(options.body);
      headers["Content-Type"] = "application/json";
    }
  }

  try {
    const response = await fetch(url, { method, headers, body, signal: options?.signal });

    if (response.status === 401 && window.location.pathname !== "/login") {
      log.warn("API request unauthorized (401).");
    }

    if (!response.ok) {
      let errorData: Record<string, unknown>;
      try {
        errorData = await response.json();
      } catch {
        errorData = { detail: response.statusText };
      }
      return { data: undefined, error: errorData };
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) {
      return { data: undefined as unknown as T, error: undefined };
    }

    const data = (await response.json()) as T;
    return { data, error: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: undefined, error: { detail: message } };
  }
}

/**
 * Simple HTTP client with GET, POST, PUT, DELETE methods.
 * Returns { data, error } for each request.
 */
export const client = {
  GET: <T = any>(
    path: string,
    options?: RequestOptions
  ): Promise<ClientResult<T>> => request<T>("GET", path, options),

  POST: <T = any>(
    path: string,
    options?: RequestOptions
  ): Promise<ClientResult<T>> => request<T>("POST", path, options),

  PUT: <T = any>(
    path: string,
    options?: RequestOptions
  ): Promise<ClientResult<T>> => request<T>("PUT", path, options),

  DELETE: <T = any>(
    path: string,
    options?: RequestOptions
  ): Promise<ClientResult<T>> => request<T>("DELETE", path, options)
};

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
