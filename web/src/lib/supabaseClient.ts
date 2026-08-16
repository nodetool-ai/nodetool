import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RuntimeConfig } from "./runtimeConfig";
import {
  buildTimeSupabaseUrl as buildTimeUrl,
  buildTimeSupabaseAnonKey as buildTimeAnonKey
} from "./supabaseBuildTimeEnv";

/**
 * Supabase client for the web app.
 *
 * Credentials come from the backend at runtime via `GET /api/config` (see
 * `runtimeConfig.ts`) and are applied at boot through `initSupabaseFromConfig`.
 * The build-time `VITE_SUPABASE_*` variables remain a fallback for the dev
 * server and pure-static hosting where `/api/config` is not reachable.
 *
 * The exported `supabase` handle is stable across (re)initialization: it proxies
 * to a swappable underlying client, so existing `import { supabase }` callers
 * keep working after runtime config replaces the credentials.
 */

const FALLBACK_URL = "http://localhost";
const FALLBACK_ANON_KEY = "public-anon-key";

const makeClient = (
  url: string | null | undefined,
  key: string | null | undefined
) => {
  const resolvedUrl = url || buildTimeUrl || FALLBACK_URL;
  const resolvedKey = key || buildTimeAnonKey || FALLBACK_ANON_KEY;
  if (!url && !buildTimeUrl) {
    console.warn(
      "Supabase credentials not configured. Using placeholders — login will " +
        "not work until the backend provides them via /api/config (or " +
        "VITE_SUPABASE_* is set at build time)."
    );
  }
  return {
    client: createClient(resolvedUrl, resolvedKey),
    url: resolvedUrl,
    anonKey: resolvedKey
  };
};

let current = makeClient(null, null);
let innerClient: SupabaseClient = current.client;

let configError: string | null = null;

/**
 * The reason Supabase auth cannot work, or null when it can.
 *
 * Non-null means the client is holding `FALLBACK_ANON_KEY` while talking to a
 * backend that enforces auth, so every Supabase request — login included —
 * answers 401.
 */
export const getSupabaseConfigError = (): string | null => configError;

/**
 * Rebuild the Supabase client from runtime config fetched from the backend.
 * Called once at boot after `loadRuntimeConfig()`, before auth initializes.
 */
export const initSupabaseFromConfig = (config: RuntimeConfig): void => {
  const resolvedUrl = config.supabaseUrl || buildTimeUrl || FALLBACK_URL;
  const resolvedKey =
    config.supabaseAnonKey || buildTimeAnonKey || FALLBACK_ANON_KEY;

  // Falling back to the placeholder key is harmless in Local mode, where
  // Supabase is never called. In Supabase mode it is fatal *and* invisible: the
  // URL is real, so the warning in `makeClient` stays quiet, and the app boots
  // into a login screen that can only ever 401.
  configError =
    config.authMode === "supabase" && resolvedKey === FALLBACK_ANON_KEY
      ? "Supabase auth is enabled but no anon key reached the browser: " +
        "GET /api/config returned supabaseAnonKey: null and no build-time " +
        "VITE_SUPABASE_ANON_KEY is set. Login will fail with 401 until the " +
        "server sets SUPABASE_ANON_KEY (the public anon key — not " +
        "SUPABASE_KEY, which is the service-role key)."
      : null;
  if (configError) {
    console.error(configError);
  }

  if (current.url === resolvedUrl && current.anonKey === resolvedKey) {
    return;
  }
  current = makeClient(resolvedUrl, resolvedKey);
  innerClient = current.client;
};

// SAFETY: the proxy target is never read — every access is forwarded to
// `innerClient`, which is a real SupabaseClient — so the empty object only has
// to satisfy the type, and `prop` can only be a key callers reached through it.
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_target, prop) => innerClient[prop as keyof SupabaseClient]
});
