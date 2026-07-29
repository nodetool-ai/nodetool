import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RuntimeConfig } from "./runtimeConfig";

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

const buildTimeUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const buildTimeAnonKey: string | undefined =
  import.meta.env.VITE_SUPABASE_ANON_KEY;

const makeClient = (
  url: string | null | undefined,
  key: string | null | undefined
): {
  client: SupabaseClient;
  anonKey: string;
  url: string;
} => {
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

/**
 * Rebuild the Supabase client from runtime config fetched from the backend.
 * Called once at boot after `loadRuntimeConfig()`, before auth initializes.
 */
export const initSupabaseFromConfig = (config: RuntimeConfig): void => {
  const resolvedUrl = config.supabaseUrl || buildTimeUrl || FALLBACK_URL;
  const resolvedKey =
    config.supabaseAnonKey || buildTimeAnonKey || FALLBACK_ANON_KEY;
  if (current.url === resolvedUrl && current.anonKey === resolvedKey) {
    return;
  }
  current = makeClient(config.supabaseUrl, config.supabaseAnonKey);
  innerClient = current.client;
};

export const supabase = new Proxy({} as SupabaseClient, {
  get: (_target, prop) => Reflect.get(innerClient, prop)
});
