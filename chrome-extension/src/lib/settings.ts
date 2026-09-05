/**
 * Chat settings persisted in `chrome.storage.local`.
 *
 * The CDP relay stores its own `/ws/extension` URL (see `cdp-relay.ts`); the
 * chat panel needs an HTTP base instead, for `/trpc` calls and the `/ws` chat
 * socket. They are separate keys so changing one cannot break the other, but
 * an unset base is seeded from the relay URL's origin — a user who already
 * pointed the relay at a server should not have to type the host twice.
 */

import { DEFAULT_SERVER_URL, STORAGE_KEY_SERVER_URL } from "./cdp-relay.js";

/** Base URL of the NodeTool server the chat panel talks to. */
export const STORAGE_KEY_API_BASE_URL = "nodetool_api_base_url";

/** Bearer token for servers that enforce auth. Empty for a local server. */
export const STORAGE_KEY_AUTH_TOKEN = "nodetool_auth_token";

/** The model the picker last settled on, restored on the next open. */
export const STORAGE_KEY_SELECTED_MODEL = "nodetool_selected_model";

export const DEFAULT_API_BASE_URL = "http://localhost:7777";

export interface SelectedModel {
  id: string;
  name: string;
  provider: string;
}

export interface ChatSettings {
  apiBaseUrl: string;
  authToken: string;
  selectedModel: SelectedModel | null;
}

export async function loadChatSettings(): Promise<ChatSettings> {
  const stored = await chrome.storage.local.get([
    STORAGE_KEY_API_BASE_URL,
    STORAGE_KEY_AUTH_TOKEN,
    STORAGE_KEY_SELECTED_MODEL,
    STORAGE_KEY_SERVER_URL,
  ]);
  return {
    apiBaseUrl:
      readString(stored[STORAGE_KEY_API_BASE_URL]) ??
      originOfRelayUrl(readString(stored[STORAGE_KEY_SERVER_URL])) ??
      DEFAULT_API_BASE_URL,
    authToken: readString(stored[STORAGE_KEY_AUTH_TOKEN]) ?? "",
    selectedModel: readSelectedModel(stored[STORAGE_KEY_SELECTED_MODEL]),
  };
}

export async function saveApiBaseUrl(url: string): Promise<string> {
  const normalized = normalizeBaseUrl(url);
  await chrome.storage.local.set({ [STORAGE_KEY_API_BASE_URL]: normalized });
  return normalized;
}

export async function saveAuthToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_AUTH_TOKEN]: token.trim() });
}

export async function saveSelectedModel(
  model: SelectedModel | null,
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_SELECTED_MODEL]: model });
}

/**
 * Accept what a user types — `localhost:7777`, a trailing slash, a pasted
 * `http://localhost:7777/chat` — and reduce it to a scheme-qualified origin.
 * Anything unparseable is handed back trimmed so the field still shows what
 * was entered rather than silently reverting.
 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_API_BASE_URL;
  const withScheme = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol === "ws:") url.protocol = "http:";
    if (url.protocol === "wss:") url.protocol = "https:";
    return url.origin;
  } catch {
    return trimmed;
  }
}

/** `ws://localhost:7777/ws/extension` → `http://localhost:7777`. */
function originOfRelayUrl(relayUrl: string | null): string | null {
  if (!relayUrl || relayUrl === DEFAULT_SERVER_URL) return null;
  const origin = normalizeBaseUrl(relayUrl);
  return origin || null;
}

/**
 * Whether the extension may call this server at all.
 *
 * A cross-origin `fetch` from an extension page is CORS-checked unless the
 * host is in `host_permissions` — the NodeTool server sends no
 * `Access-Control-Allow-Origin` for a `chrome-extension://` origin, so a host
 * outside the grant fails every request. `localhost`, `127.0.0.1` and any
 * HTTPS host ship in the manifest; anything else (a LAN box over plain HTTP)
 * has to be granted, and `chrome.permissions.request` needs a user gesture —
 * hence the call sitting behind the settings Save button.
 */
export async function ensureHostAccess(baseUrl: string): Promise<boolean> {
  const origins = [`${normalizeBaseUrl(baseUrl)}/*`];
  if (await chrome.permissions.contains({ origins })) return true;
  return chrome.permissions.request({ origins });
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readSelectedModel(value: unknown): SelectedModel | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const { id, name, provider } = record;
  if (typeof id !== "string" || typeof provider !== "string") return null;
  return { id, name: typeof name === "string" ? name : id, provider };
}
