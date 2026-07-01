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
 */
import { BASE_URL } from "../stores/BASE_URL";

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
  /** Backend version, for diagnostics. */
  version: string | null;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  authMode: "local",
  supabaseUrl: null,
  supabaseAnonKey: null,
  authRedirectUrl: null,
  version: null
};

let current: RuntimeConfig = DEFAULT_CONFIG;
let loaded = false;

/** The last-loaded runtime config (defaults until `loadRuntimeConfig` resolves). */
export const getRuntimeConfig = (): RuntimeConfig => current;

/** True when the backend enforces authentication (Supabase mode). */
export const isAuthRequired = (): boolean => current.authMode === "supabase";

const coerce = (data: unknown): RuntimeConfig => {
  if (!data || typeof data !== "object") return DEFAULT_CONFIG;
  const d = data as Partial<RuntimeConfig>;
  return {
    authMode: d.authMode === "supabase" ? "supabase" : "local",
    supabaseUrl: d.supabaseUrl ?? null,
    supabaseAnonKey: d.supabaseAnonKey ?? null,
    authRedirectUrl: d.authRedirectUrl ?? null,
    version: d.version ?? null
  };
};

/**
 * Fetch public runtime config from the backend (`GET /api/config`). Cached
 * after the first successful load. On failure (e.g. an older server without
 * the endpoint) it keeps the defaults so the app still boots.
 */
export const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
  if (loaded) return current;
  try {
    const res = await fetch(`${BASE_URL}/api/config`, {
      headers: { Accept: "application/json" },
      // Don't let a slow/unreachable backend block app boot.
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`GET /api/config failed: ${res.status}`);
    current = coerce(await res.json());
  } catch (err) {
    console.warn(
      "Runtime config unavailable; falling back to local auth defaults.",
      err
    );
    current = DEFAULT_CONFIG;
  }
  loaded = true;
  return current;
};
