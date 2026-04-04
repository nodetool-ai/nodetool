/**
 * HuggingFace authentication token resolution.
 *
 * Resolves HF tokens from environment variables and token files,
 * following the same semantics as the official huggingface_hub library.
 *
 * No external dependencies -- uses only Node.js built-ins.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

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

/**
 * Return the HF_HOME directory following the same resolution order as
 * the official hub library:
 *   1. $HF_HOME
 *   2. $XDG_CACHE_HOME/huggingface
 *   3. ~/.cache/huggingface
 */
function hfHomeDir(): string {
  const hfHome = process.env["HF_HOME"];
  if (hfHome)
    return hfHome.startsWith("~") ? hfHome.replace("~", os.homedir()) : hfHome;

  const xdg = process.env["XDG_CACHE_HOME"];
  if (xdg) return path.join(xdg, "huggingface");

  return path.join(os.homedir(), ".cache", "huggingface");
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

  if (typeof token === "string") return token;

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
