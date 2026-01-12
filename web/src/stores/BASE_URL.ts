/**
 * Base URL for the backend API.
 *
 * The value is taken from the `VITE_API_URL` environment variable when
 * available. When running locally without a `.env` file, it uses an empty string
 * to allow relative URLs which will be proxied by Vite to localhost:7777.
 */

export const defaultLocalUrl = ""; // Empty string for relative URLs (proxied by Vite)

const apiEnv = import.meta.env.VITE_API_URL;

export const BASE_URL = apiEnv || defaultLocalUrl;

/**
 * Helper function to get WebSocket URL from BASE_URL.
 * When BASE_URL is empty (local dev), uses current origin with ws protocol.
 */
const getWebSocketUrl = (path: string): string => {
  if (BASE_URL) {
    return BASE_URL.replace(/^http/, "ws") + path;
  }
  // When BASE_URL is empty, use current origin with ws protocol
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${path}`;
  }
  return `ws://localhost:3000${path}`;
};

/** WebSocket URL for the unified endpoint (workflows and chat). */
export const UNIFIED_WS_URL = getWebSocketUrl("/ws");

/** WebSocket URL for the prediction worker endpoint.
 * @deprecated Use UNIFIED_WS_URL instead. This endpoint is deprecated.
 */
export const WORKER_URL = getWebSocketUrl("/ws");

/** WebSocket URL for the chat endpoint.
 * @deprecated Use UNIFIED_WS_URL instead. This endpoint is deprecated.
 */
export const CHAT_URL = getWebSocketUrl("/ws");

/** WebSocket URL for the HuggingFace model download endpoint. */
export const DOWNLOAD_URL = getWebSocketUrl("/ws/download");

/** WebSocket URL for the terminal endpoint. */
export const TERMINAL_URL = getWebSocketUrl("/ws/terminal");
