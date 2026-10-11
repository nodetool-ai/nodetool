/**
 * Settings the local Python worker reads from its environment at start.
 *
 * The worker inherits the server's environment, and a desktop app launched
 * from Finder or the Start menu has none of the user's shell exports. These
 * settings are resolved through the setting store (Settings first, then the
 * environment, like provider settings) and passed to the worker when it is
 * spawned. Changing one needs a worker restart, which the setting
 * descriptions say.
 */

import { getSecret } from "@nodetool-ai/models";

/** Settings the worker or its node packs read with `os.environ`. */
export const WORKER_ENV_SETTINGS = [
  // nodetool-core: torch device for every node (cuda, cuda:N, mps, cpu).
  "NODETOOL_TORCH_DEVICE",
  // nodetool-wan2gp: the Wan2GP server's MCP endpoint.
  "WAN2GP_MCP_URL"
] as const;

/** The user whose settings a single-user (local) server applies. */
const LOCAL_USER_ID = "1";

/** Environment entries for the worker settings that have a value. */
export async function resolveWorkerSettingsEnv(
  userId: string = LOCAL_USER_ID
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const key of WORKER_ENV_SETTINGS) {
    const value = (await getSecret(key, userId))?.trim();
    if (value) {
      env[key] = value;
    }
  }
  return env;
}

/**
 * Copy `TRANSFORMERS_JS_CACHE_DIR` from Settings into `process.env` before
 * Transformers.js first loads. The library fixes its cache directory on
 * import, and every reader (nodes, provider, Model Manager scan) resolves the
 * directory from `process.env`, so this is the one place a saved value can
 * take effect. Returns the applied value, if any.
 */
export async function applyTransformersJsCacheSetting(
  userId: string = LOCAL_USER_ID
): Promise<string | null> {
  const value = (await getSecret("TRANSFORMERS_JS_CACHE_DIR", userId))?.trim();
  if (!value) {
    return null;
  }
  process.env["TRANSFORMERS_JS_CACHE_DIR"] = value;
  return value;
}
