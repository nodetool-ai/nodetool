/**
 * The cloud window of the desktop app (decision D27, technical design,
 * "Cloud window"; WP1.15).
 *
 * The main process tells this page, before any page code runs, whether it is
 * the cloud window and for which server and account. In the cloud window the
 * web app's one server is that cloud server: `BASE_URL` is its origin, and
 * every request to it goes through the main process, which adds the
 * credential. Requests to the local server's API are refused, except the
 * drafts client's, which uses `localFetch`.
 *
 * This module has no imports from the app, so `BASE_URL` can read it.
 */

export interface CloudWindowOrigin {
  readonly server: string;
  readonly account: string;
}

function readOrigin(): CloudWindowOrigin | null {
  if (typeof window === "undefined") {
    return null;
  }
  const origin = window.api?.cloud?.window;
  return origin && origin.server && origin.account ? origin : null;
}

/** This window's server and account, or null outside the cloud window. */
export const CLOUD_WINDOW: CloudWindowOrigin | null = readOrigin();

export const isCloudWindow = (): boolean => CLOUD_WINDOW !== null;

/** The page's own `fetch`, taken before the cloud window wraps it. */
export const localFetch: typeof fetch | null =
  typeof window !== "undefined" && typeof window.fetch === "function" ? window.fetch.bind(window) : null;

/** The local server's paths the cloud window's page may not reach. */
const LOCAL_API_PREFIXES = ["/api/", "/trpc/", "/ws"];

/** Whether the cloud window refuses a request to `url` on the local server. */
export function refusedInCloudWindow(url: URL, localOrigin: string): boolean {
  return url.origin === localOrigin && LOCAL_API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}
