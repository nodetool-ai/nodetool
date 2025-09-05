/**
 * Base URL for the backend API.
 *
 * The value is taken from the `VITE_API_URL` environment variable when
 * available. When running locally without a `.env` file the URL falls back to
 * the current hostname on port `8000`.
 */

export const defaultLocalUrl =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000"; /** WebSocket URL for the prediction worker endpoint. */

export const BASE_URL = import.meta.env.VITE_API_URL || defaultLocalUrl;

export const WORKER_URL =
  BASE_URL.replace(/^http/, "ws") + // Replaces http/https with ws/wss
  "/predict"; /** WebSocket URL for the chat endpoint. */

export const CHAT_URL =
  BASE_URL.replace(/^http/, "ws") +
  "/chat"; /** WebSocket URL for the HuggingFace model download endpoint. */

export const DOWNLOAD_URL = BASE_URL.replace(/^http/, "ws") + "/hf/download";
