import { CLOUD_WINDOW } from "../lib/cloud/cloudWindow";
import { isString } from "../utils/typePredicates";
/**
 * Base URL for the backend API.
 *
 * The value is taken from the `VITE_API_URL` environment variable when
 * available. When running locally without a `.env` file, it uses an empty string
 * to allow relative URLs which will be proxied by Vite to localhost:7777.
 */

const defaultLocalUrl = "";

const apiEnv = import.meta.env.VITE_API_URL;

/**
 * In the desktop app's cloud window (D27) the one server is the signed-in
 * cloud server, and its requests go through the main process.
 */
export const BASE_URL = CLOUD_WINDOW?.server ?? (apiEnv || defaultLocalUrl);

/**
 * Helper function to get WebSocket URL from BASE_URL.
 * When BASE_URL is empty (local dev), uses current origin with ws protocol.
 */
const getWebSocketUrl = (path: string): string => {
  if (BASE_URL) {
    return BASE_URL.replace(/^http/, "ws") + path;
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${path}`;
  }
  return `ws://localhost:3000${path}`;
};

/** WebSocket URL for the unified endpoint (workflows and chat). */
export const UNIFIED_WS_URL = getWebSocketUrl("/ws");

/** WebSocket URL for the HuggingFace model download endpoint. */
export const DOWNLOAD_URL = getWebSocketUrl("/ws/download");

/**
 * Prefix a relative URL with `BASE_URL` when it is set. Absolute URLs
 * (http://, https://, blob:, data:, ws://, etc.) and empty values are
 * returned unchanged.
 */
export const withApiBase = <T extends string | null | undefined>(url: T): T => {
  if (!BASE_URL) return url;
  if (!url) return url;
  if (!isString(url)) return url;
  if (!url.startsWith("/")) return url;
  return `${BASE_URL}${url}` as T;
};
