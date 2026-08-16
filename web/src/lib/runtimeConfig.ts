/**
 * Runtime configuration fetched from the backend at boot.
 *
 * Consolidates configuration on the server: the web app learns its auth mode
 * and public Supabase credentials from `GET /api/config` at runtime instead of
 * from build-time `VITE_*` variables. This lets a single frontend build talk to
 * any backend — including one served from a different origin — and lets
 * operators configure only the backend (see `packages/websocket/src/routes/config.ts`).
 *
 * Build-time `VITE_*` values remain a fallback in `supabaseClient.ts` for the
 * dev server and pure-static hosting where `/api/config` is not reachable.
 * They are the fallback for the auth *mode* too: a bundle built with Supabase
 * credentials is a Supabase deployment even when its backend is momentarily
 * unreachable. Assuming Local mode there would silently log the user in as the
 * single local user against a server that enforces auth.
 */
import { BASE_URL } from "../stores/BASE_URL";
import { getBuildEnv } from "./buildEnv";
import { isObjectLike } from "../utils/typePredicates";

export type AuthMode = "local" | "supabase";

export interface RuntimeConfig {
  /** Whether the backend enforces authentication. */
  authMode: AuthMode;
  /** Supabase project URL (Supabase mode only). */
  supabaseUrl: string | null;
  /** Supabase anon (public) key — safe to use in the browser. */
  supabaseAnonKey: string | null;
  /** Optional OAuth redirect override. */
  authRedirectUrl: string | null;
  /**
   * Whether the backend offers the Google Workspace integration (Drive, Gmail,
   * Docs, Sheets, Calendar). It runs on the token from the Google login, so it
   * is off in Local mode.
   */
  googleWorkspace: boolean;
  /** Google OAuth scopes to request at sign-in when the integration is on. */
  googleScopes: string[];
  /** Backend version, for diagnostics. */
  version: string | null;
}

/**
 * Config to use when `/api/config` cannot be read: the build-time `VITE_*`
 * values. A build carrying Supabase credentials targets a Supabase backend, so
 * its auth mode falls back to `supabase`; a build without them (the dev server,
 * the desktop app) falls back to `local`.
 */
const fallbackConfig = (): RuntimeConfig => {
  const supabaseUrl = getBuildEnv("VITE_SUPABASE_URL") ?? null;
  const supabaseAnonKey = getBuildEnv("VITE_SUPABASE_ANON_KEY") ?? null;
  return {
    authMode: supabaseUrl && supabaseAnonKey ? "supabase" : "local",
    supabaseUrl,
    supabaseAnonKey,
    authRedirectUrl: getBuildEnv("VITE_AUTH_REDIRECT_URL") ?? null,
    googleWorkspace: false,
    googleScopes: [],
    version: null
  };
};

/** Attempts against `/api/config`, and the per-attempt timeout. */
const FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 4000;
const RETRY_DELAY_MS = [300, 900];

let current: RuntimeConfig = fallbackConfig();
let loaded = false;
let fromBackend = false;

/** The last-loaded runtime config (defaults until `loadRuntimeConfig` resolves). */
export const getRuntimeConfig = (): RuntimeConfig => current;

/**
 * True when the config in use came from the backend. False means
 * `/api/config` was unreachable and the build-time fallback is in effect —
 * the auth mode is inferred, not confirmed.
 */
export const isRuntimeConfigFromBackend = (): boolean => fromBackend;

/** True when the backend enforces authentication (Supabase mode). */
export const isAuthRequired = (): boolean => current.authMode === "supabase";

const coerce = (data: unknown): RuntimeConfig => {
  if (!data || !isObjectLike(data)) return fallbackConfig();
  const d = data as Partial<RuntimeConfig>;
  return {
    authMode: d.authMode === "supabase" ? "supabase" : "local",
    supabaseUrl: d.supabaseUrl ?? null,
    supabaseAnonKey: d.supabaseAnonKey ?? null,
    authRedirectUrl: d.authRedirectUrl ?? null,
    googleWorkspace: d.googleWorkspace === true,
    googleScopes: Array.isArray(d.googleScopes) ? d.googleScopes : [],
    version: d.version ?? null
  };
};

/** True when the backend offers the Google Workspace tools and nodes. */
export const isGoogleWorkspaceEnabled = (): boolean => current.googleWorkspace;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const fetchConfig = async (): Promise<RuntimeConfig> => {
  const res = await fetch(`${BASE_URL}/api/config`, {
    headers: { Accept: "application/json" },
    // Don't let a slow/unreachable backend block app boot.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`GET /api/config failed: ${res.status}`);
  return coerce(await res.json());
};

/**
 * Fetch public runtime config from the backend (`GET /api/config`). Cached
 * after the first load. Retried a few times, because a cold or restarting
 * server answering one request with a 503 is not a reason to change the app's
 * auth mode.
 *
 * When every attempt fails (an older server without the endpoint, a backend
 * that is down) it falls back to the build-time config so the app still boots.
 */
export const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
  if (loaded) return current;
  let lastError: unknown;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS[attempt - 1] ?? 900);
    }
    try {
      current = await fetchConfig();
      fromBackend = true;
      loaded = true;
      return current;
    } catch (err) {
      lastError = err;
    }
  }
  current = fallbackConfig();
  fromBackend = false;
  loaded = true;
  console.warn(
    `Runtime config unavailable after ${FETCH_ATTEMPTS} attempts; ` +
      `falling back to build-time config (auth mode: ${current.authMode}).`,
    lastError
  );
  return current;
};
