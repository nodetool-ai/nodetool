/**
 * Helper functions for retrieving secrets at runtime.
 *
 * Resolution order for getSecret():
 * 1. Forced env priority keys -> environment variable
 * 2. Local cache
 * 3. Database (encrypted Secret model) -- if userId provided
 * 4. Environment variable
 * 5. Default value
 *
 * A value found in steps 1-4 may be a 1Password secret reference
 * (`op://vault/item/field`). It is resolved through 1Password before it is
 * returned (see onepassword.ts). References stored by users resolve only when
 * userReferencesAllowed() permits it.
 *
 * NOTE on encryption compatibility: TS uses AES-256-GCM while Python uses Fernet.
 * Secrets encrypted in Python cannot be decrypted in TS and vice versa.
 * New secrets must be created via the TS endpoints for TS runtime access.
 */

import { createLogger } from "@nodetool-ai/config";
import { Secret } from "./secret.js";
import { Setting } from "./setting.js";
import { resolveCodexAccessToken } from "./codex-token.js";
import {
  GOOGLE_ACCESS_TOKEN_KEY,
  resolveGoogleAccessToken
} from "./google-token.js";
import {
  clearOnePasswordCache,
  isOnePasswordReference,
  isRefusedUserReference,
  resolveOnePasswordReference
} from "./onepassword.js";

const log = createLogger("nodetool.models.secret-helper");

/** Cache for resolved secrets: "userId:key" -> value */
const secretCache = new Map<string, string | null>();

/** Keys that should always prioritize environment variables */
const FORCE_ENV_PRIORITY = new Set([
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SERVER_AUTH_TOKEN"
]);

/** Clear a specific secret from the local cache. */
export function clearSecretCache(userId: string, key: string): void {
  secretCache.delete(`${userId}:${key}`);
}

/** Clear all cached secrets. */
export function clearAllSecretCache(): void {
  secretCache.clear();
  clearOnePasswordCache();
}

/**
 * Turn a raw value into the secret it stands for. Plain values pass through.
 * secretCache holds the reference, not the secret, and the 1Password cache
 * expires, so an item rotated in 1Password is picked up without a restart.
 */
async function materialize(
  value: string,
  userId?: string
): Promise<string | null> {
  if (!isOnePasswordReference(value)) {
    return value;
  }
  return resolveOnePasswordReference(value, userId);
}

/** Get a secret value for a user (resolution order documented at file top). */
export async function getSecret(
  key: string,
  userId?: string,
  defaultValue?: string
): Promise<string | null> {
  const resolvedUserId = userId ?? "default";

  // The Codex provider's bearer is not a stored Secret — it lives in the
  // OAuthCredential table and may need a refresh. Resolve it directly.
  if (key === "CODEX_ACCESS_TOKEN") {
    try {
      return await resolveCodexAccessToken(resolvedUserId);
    } catch (err) {
      log.error("Codex token resolution failed", {
        userId: resolvedUserId,
        error: String(err)
      });
      return null;
    }
  }

  // The Google Workspace bearer comes from the user's Google login, not from a
  // stored Secret, and may need a refresh. Resolve it directly — never cache,
  // since the value rotates roughly hourly.
  if (key === GOOGLE_ACCESS_TOKEN_KEY) {
    try {
      return await resolveGoogleAccessToken(resolvedUserId);
    } catch (err) {
      log.error("Google token resolution failed", {
        userId: resolvedUserId,
        error: String(err)
      });
      return null;
    }
  }

  if (FORCE_ENV_PRIORITY.has(key)) {
    const envVal = process.env[key];
    if (envVal !== undefined) {
      return materialize(envVal, userId);
    }
  }

  const cacheKey = `${resolvedUserId}:${key}`;
  if (secretCache.has(cacheKey)) {
    const cached = secretCache.get(cacheKey) ?? null;
    return cached === null ? null : materialize(cached, userId);
  }

  if (userId) {
    try {
      const secret = await Secret.find(userId, key);
      if (secret) {
        const value = await secret.getDecryptedValue();
        if (value !== null && value !== undefined) {
          if (isRefusedUserReference(key, value)) {
            return null;
          }
          secretCache.set(cacheKey, value);
          return materialize(value, userId);
        }
      }
    } catch (err) {
      log.error("Secret DB lookup/decryption failed", {
        key,
        userId,
        error: String(err)
      });
    }
  }

  // Non-secret settings (provider URLs, context lengths) are saved by the
  // Settings UI to the Setting table, not the Secret table. Read them here so
  // provider construction sees them. settings.update clears the cache entry.
  if (userId) {
    try {
      const setting = await Setting.find(userId, key);
      if (setting && setting.value.length > 0) {
        if (isRefusedUserReference(key, setting.value)) {
          return null;
        }
        secretCache.set(cacheKey, setting.value);
        return materialize(setting.value, userId);
      }
    } catch (err) {
      log.error("Setting DB lookup failed", {
        key,
        userId,
        error: String(err)
      });
    }
  }

  const envValue = process.env[key];
  if (envValue !== undefined) {
    secretCache.set(cacheKey, envValue);
    return materialize(envValue, userId);
  }

  if (defaultValue !== undefined) {
    return defaultValue;
  }

  return null;
}

/** Get a required secret value for a user. Throws if not found. */
export async function getSecretRequired(
  key: string,
  userId?: string
): Promise<string> {
  const value = await getSecret(key, userId);
  if (value === null) {
    throw new Error(
      `Required secret '${key}' not found, please set it in the settings menu.`
    );
  }
  return value;
}

/** Check if a secret exists for a user. */
export async function hasSecret(
  key: string,
  userId?: string
): Promise<boolean> {
  const resolvedUserId = userId ?? "default";

  if (process.env[key] !== undefined) {
    return true;
  }

  const cacheKey = `${resolvedUserId}:${key}`;
  if (secretCache.has(cacheKey)) {
    return secretCache.get(cacheKey) !== null;
  }

  if (userId) {
    try {
      const secret = await Secret.find(userId, key);
      if (secret) {
        const value = await secret.getDecryptedValue();
        // Never cache a refused reference: getSecret() trusts cached values.
        if (isRefusedUserReference(key, value)) {
          return false;
        }
        secretCache.set(cacheKey, value);
        return true;
      }
    } catch (err) {
      log.error("Secret DB lookup/decryption failed", {
        key,
        userId,
        error: String(err)
      });
    }
  }

  return false;
}

/**
 * Get a secret value synchronously from environment variables only.
 *
 * Does NOT check the database or resolve 1Password references. Use
 * getSecret() for full resolution.
 */
export function getSecretSync(
  key: string,
  defaultValue?: string
): string | null {
  if (FORCE_ENV_PRIORITY.has(key)) {
    const envVal = process.env[key];
    if (envVal !== undefined) {
      return envVal;
    }
  }

  const envValue = process.env[key];
  if (envValue !== undefined) {
    return envValue;
  }

  if (defaultValue !== undefined) {
    return defaultValue;
  }

  return null;
}
