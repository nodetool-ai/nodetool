/**
 * Base URL configuration for the Chrome extension.
 * Uses the server URL from the extension store settings.
 */

// Default server URL when running locally
export const DEFAULT_SERVER_URL = "http://localhost:7777";

/**
 * Get the base URL for API requests.
 * In the extension context, this comes from the store settings.
 */
export const getBaseUrl = (): string => {
  // This will be called with the store value from the component
  return DEFAULT_SERVER_URL;
};

/**
 * Helper function to get WebSocket URL from a base URL.
 */
export const getWebSocketUrl = (baseUrl: string, path: string): string => {
  if (!baseUrl) {
    return `ws://localhost:8000${path}`;
  }
  return baseUrl.replace(/^http/, "ws") + path;
};

/**
 * WebSocket path for the unified endpoint.
 */
export const WS_PATH = "/ws";

/**
 * Get the full WebSocket URL for a given base URL.
 */
export const getChatUrl = (baseUrl: string): string => {
  return getWebSocketUrl(baseUrl, WS_PATH);
};
