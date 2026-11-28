/**
 * HuggingFace authentication token resolution.
 *
 * Resolves HF tokens from environment variables and token files,
 * following the same semantics as the official huggingface_hub library.
 *
 * Directory resolution comes from `@nodetool-ai/config`.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import {
  getHfHomeDir,
  isAuthEnforced,
  isCloudProfileEnv,
  mayUseServerCredential,
  resolveHfEndpoint
} from "@nodetool-ai/config";

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let _cachedHfToken: string | null | undefined; // undefined = not yet resolved

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function envBool(name: string): boolean {
  const v = process.env[name];
  if (v == null) return false;
  return ["1", "TRUE", "YES", "ON"].includes(v.trim().toUpperCase());
}

/** The Hugging Face home directory, resolved by `getHfHomeDir` in `@nodetool-ai/config`. */
function hfHomeDir(): string {
  return getHfHomeDir();
}

// ---------------------------------------------------------------------------
// Token from environment variables
// ---------------------------------------------------------------------------

function getHfTokenFromEnv(): string | null {
  for (const name of ["HF_TOKEN", "HF_API_TOKEN", "HUGGING_FACE_HUB_TOKEN"]) {
    const value = process.env[name];
    if (value) {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Token from file
// ---------------------------------------------------------------------------

async function getHfTokenFromFile(): Promise<string | null> {
  const tokenPathEnv = process.env["HF_TOKEN_PATH"];

  let tokenPath: string;
  if (tokenPathEnv) {
    tokenPath = tokenPathEnv.startsWith("~")
      ? tokenPathEnv.replace("~", os.homedir())
      : tokenPathEnv;
  } else {
    tokenPath = path.join(hfHomeDir(), "token");
  }

  try {
    const txt = await fs.readFile(tokenPath, "utf-8");
    const trimmed = txt.trim();
    return trimmed || null;
  } catch {
    // File not found or not readable -- that is fine.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cached token
// ---------------------------------------------------------------------------

/**
 * Resolve the HuggingFace token from environment variables and token files.
 *
 * Resolution order:
 *   1. `HF_TOKEN`, `HF_API_TOKEN`, `HUGGING_FACE_HUB_TOKEN` env vars
 *   2. Token file at `$HF_TOKEN_PATH` or `$HF_HOME/token` (default
 *      `~/.cache/huggingface/token`)
 *
 * The result is cached in-memory after the first call so that subsequent
 * calls avoid hitting the filesystem again.
 */
export async function getHfToken(): Promise<string | null> {
  if (_cachedHfToken !== undefined) return _cachedHfToken;

  const token = getHfTokenFromEnv() ?? (await getHfTokenFromFile());
  _cachedHfToken = token;
  return token;
}

/**
 * Clear the cached token so the next call to {@link getHfToken} re-reads
 * from the environment / filesystem.
 */
export function clearHfTokenCache(): void {
  _cachedHfToken = undefined;
}

// ---------------------------------------------------------------------------
// HF-style token resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a token value using HuggingFace-style semantics:
 *
 *  - `string`  -- use it as-is.
 *  - `false`   -- explicitly disable authentication (returns `null`).
 *  - `true`    -- require a locally saved token; throws if none found.
 *  - `null` / `undefined` -- use the cached token unless
 *    `HF_HUB_DISABLE_IMPLICIT_TOKEN` is set.
 */
export async function resolveHfToken(
  token: string | boolean | null | undefined
): Promise<string | null> {
  if (token === false) return null;

  // Anything left that is neither `true` nor nullish is the token string.
  if (token !== true && token != null) return token;

  const cached = await getHfToken();
  const disableImplicit = envBool("HF_HUB_DISABLE_IMPLICIT_TOKEN");

  if (token === true) {
    if (cached == null) {
      throw new Error(
        "Token is required (token=true), but no Hugging Face token " +
          "was found in env or token file. Run `hf auth login` or set HF_TOKEN."
      );
    }
    return cached;
  }

  // token is null / undefined
  if (disableImplicit) return null;
  return cached;
}

// ---------------------------------------------------------------------------
// Token for a remote worker
// ---------------------------------------------------------------------------

/**
 * Reads one credential out of NodeTool's secret store. Injected rather than
 * imported so this package keeps no dependency on `@nodetool-ai/models`.
 */
export type SecretReader = (
  key: string
) => Promise<string | null | undefined> | string | null | undefined;

/**
 * Resolve the HuggingFace token for a download the host starts or relays.
 *
 * A rented worker has neither a secret store nor `HF_TOKEN` in its
 * environment, so it can only download public repos. The host resolves the
 * credential instead and sends it with the `models.download` request
 * (nodetool-ai/nodetool#5184). Local server downloads use it too, because a
 * token saved in Settings lives in the secret store, not the environment.
 *
 * Order: the user's stored `HF_TOKEN` first, then this process's own
 * environment and HF token file via {@link getHfToken}. A blank value at
 * either step is not a credential and yields `undefined`, so the worker takes
 * its own fallback rather than receiving an empty Bearer header. A secret
 * store that throws (locked, absent) falls through to the environment instead
 * of failing the download.
 */
export async function resolveWorkerHfToken(
  readSecret?: SecretReader
): Promise<string | undefined> {
  if (readSecret) {
    try {
      const stored = (await readSecret("HF_TOKEN"))?.trim();
      if (stored) return stored;
    } catch {
      // A locked or missing secret store is not an error here — fall through
      // to the environment. Never log: the failure can carry the key material.
    }
  }
  const local = await getHfToken();
  return local && local.trim() ? local.trim() : undefined;
}

/**
 * The Hub host for a user's downloads and Hub searches: their stored
 * `HF_ENDPOINT` setting, else `HF_ENDPOINT` from the environment, else the
 * public Hub. The token resolved alongside it is sent to this host, which is
 * always the public Hub or one the user or operator set.
 */
export async function resolveStoredHfEndpoint(
  readSecret?: SecretReader
): Promise<string> {
  let stored: string | undefined;
  if (readSecret) {
    try {
      stored = (await readSecret("HF_ENDPOINT"))?.trim() || undefined;
    } catch {
      // An unreadable setting falls back to the environment, as an unset one does.
    }
  }
  return resolveHfEndpoint(stored);
}

// ---------------------------------------------------------------------------
// Endpoint and token for one user's Hub request
// ---------------------------------------------------------------------------

/**
 * What a Hub request is for. A `download` writes the process-wide Hub cache,
 * which every user of the server reads; a `search` only reads the Hub.
 */
export type HfHubUse = "search" | "download";

/** The host a user's Hub request goes to, and the token sent with it. */
export interface HfHubAccess {
  endpoint: string;
  /** Bearer token for `endpoint`, or `undefined` to send none. */
  token: string | undefined;
  /** True when `endpoint` came from the user's setting, not the operator's. */
  userEndpoint: boolean;
}

/**
 * True when the server is shared between users: authentication is enforced
 * or the cloud profile is active. One person's settings then must not decide
 * what lands in the shared Hub cache.
 */
export function isSharedHfHost(
  env: Record<string, string | undefined> = process.env
): boolean {
  return isAuthEnforced(env) || isCloudProfileEnv(env);
}

/**
 * Resolve the Hub host and token for one user's request.
 *
 * - The endpoint is the user's stored `HF_ENDPOINT`, else the operator's
 *   (`HF_ENDPOINT` in the environment, else the public Hub). For a
 *   `download` on a shared server the user's value is ignored and the
 *   operator's endpoint is used.
 * - The user's stored `HF_TOKEN` goes to whichever endpoint was resolved.
 * - The server's own token (environment or HF token file, see
 *   {@link getHfToken}) is sent only to the operator's endpoint, and only
 *   where `mayUseServerCredential("HF_TOKEN")` allows it.
 */
export async function resolveHfHubAccess(
  readSecret: SecretReader | undefined,
  use: HfHubUse
): Promise<HfHubAccess> {
  const operatorEndpoint = resolveHfEndpoint(null);
  const ignoreUserEndpoint = use === "download" && isSharedHfHost();
  const endpoint = ignoreUserEndpoint
    ? operatorEndpoint
    : await resolveStoredHfEndpoint(readSecret);

  const userEndpoint = endpoint !== operatorEndpoint;

  if (readSecret) {
    try {
      const stored = (await readSecret("HF_TOKEN"))?.trim();
      if (stored) return { endpoint, token: stored, userEndpoint };
    } catch {
      // A locked or missing secret store falls through, as in
      // resolveWorkerHfToken. Never log: the failure can carry key material.
    }
  }

  if (userEndpoint || !mayUseServerCredential("HF_TOKEN")) {
    return { endpoint, token: undefined, userEndpoint };
  }
  const local = (await getHfToken())?.trim();
  return { endpoint, token: local || undefined, userEndpoint };
}
