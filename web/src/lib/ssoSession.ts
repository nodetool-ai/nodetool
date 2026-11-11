/**
 * The browser side of SSO (OIDC) sign-in.
 *
 * The backend runs the whole OpenID Connect flow and sends the browser back
 * with an `nts_` session token in the URL fragment (`#nodetool_sso=...`), or a
 * failure code (`#nodetool_sso_error=...`). This module moves the token into
 * local storage, strips the fragment from the address bar, and hands the token
 * to every transport that sends a bearer token. See
 * `packages/websocket/src/routes/oidc-auth.ts`.
 */
import { BASE_URL } from "../stores/BASE_URL";

const STORAGE_KEY = "nodetool.ssoSession";
const TOKEN_FRAGMENT = "nodetool_sso";
const ERROR_FRAGMENT = "nodetool_sso_error";
const TOKEN_PREFIX = "nts_";

/** The display identity carried in a session token. */
export interface SsoUser {
  id: string;
  email?: string;
  name?: string;
}

/** The claims of the JWT inside a session token that the web app reads. */
interface SsoPayload {
  sub: string;
  exp: number;
  email?: string;
  name?: string;
}

const readStorage = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStorage = (token: string | null): void => {
  try {
    if (token) {
      window.localStorage.setItem(STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage blocked: the session lasts as long as the page.
  }
};

/** Decode the readable payload of a session token. The server checks the signature. */
const decodePayload = (token: string): SsoPayload | null => {
  if (!token.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  const segments = token.slice(TOKEN_PREFIX.length).split(".");
  if (segments.length !== 3) {
    return null;
  }
  try {
    const encoded = segments[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    );
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const { sub, exp, email, name } = parsed as Record<string, unknown>;
    if (typeof sub !== "string" || typeof exp !== "number") {
      return null;
    }
    return {
      sub,
      exp,
      email: typeof email === "string" ? email : undefined,
      name: typeof name === "string" ? name : undefined
    };
  } catch {
    return null;
  }
};

let memoryToken: string | null = null;
const expiryListeners = new Set<() => void>();

/**
 * Be told when a request finds the session expired, so the app can return to
 * the sign-in screen. Returns the unsubscribe function.
 */
export const onSsoSessionExpired = (listener: () => void): (() => void) => {
  expiryListeners.add(listener);
  return () => {
    expiryListeners.delete(listener);
  };
};

/**
 * Take a session token or an error code out of the URL fragment, once at boot.
 * Returns the error code when sign-in failed, otherwise null.
 */
export const captureSsoRedirect = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!hash.includes(TOKEN_FRAGMENT)) {
    return null;
  }
  const params = new URLSearchParams(hash);
  const token = params.get(TOKEN_FRAGMENT);
  const error = params.get(ERROR_FRAGMENT);
  // Strip the fragment either way, so the token never stays in the address
  // bar, the history entry, or a copied link.
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search
  );
  if (token && decodePayload(token)) {
    memoryToken = token;
    writeStorage(token);
    return null;
  }
  return error ?? "invalid_session";
};

/** The current session token, or null when there is none or it expired. */
export const getSsoToken = (): string | null => {
  const token = memoryToken ?? readStorage();
  if (!token) {
    return null;
  }
  const payload = decodePayload(token);
  if (!payload || payload.exp * 1000 <= Date.now()) {
    clearSsoSession();
    expiryListeners.forEach((listener) => listener());
    return null;
  }
  memoryToken = token;
  return token;
};

/** The signed-in user, or null. */
export const getSsoUser = (): SsoUser | null => {
  const token = getSsoToken();
  const payload = token ? decodePayload(token) : null;
  if (!payload) {
    return null;
  }
  return { id: payload.sub, email: payload.email, name: payload.name };
};

/** Forget the session. The identity provider's own session is untouched. */
export const clearSsoSession = (): void => {
  memoryToken = null;
  writeStorage(null);
};

/** Send the browser to the backend, which redirects to the identity provider. */
export const startSsoLogin = (): void => {
  window.location.assign(`${BASE_URL}/api/auth/oidc/login`);
};
