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
 * NOTE on encryption compatibility: TS uses AES-256-GCM while Python uses Fernet.
 * Secrets encrypted in Python cannot be decrypted in TS and vice versa.
 * New secrets must be created via the TS endpoints for TS runtime access.
 */

import { createLogger } from "@nodetool/config";
import { Secret } from "./secret.js";

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
}

/**
 * Get a secret value for a user.
 *
 * Resolution order:
 * 1. Forced env priority keys -> environment variable
 * 2. Local cache
 * 3. Database (encrypted Secret model)
 * 4. Environment variable
 * 5. Default value
 */
export async function getSecret(
  key: string,
  userId?: string,
  defaultValue?: string
): Promise<string | null> {
  const resolvedUserId = userId ?? "default";

  if (FORCE_ENV_PRIORITY.has(key)) {
    const envVal = process.env[key];
    if (envVal !== undefined) {
      return envVal;
    }
  }

  const cacheKey = `${resolvedUserId}:${key}`;
  if (secretCache.has(cacheKey)) {
    return secretCache.get(cacheKey) ?? null;
  }

  if (userId) {
    try {
      const secret = await Secret.find(userId, key);
      if (secret) {
        const value = await secret.getDecryptedValue();
        if (value !== null && value !== undefined) {
          secretCache.set(cacheKey, value);
          return value;
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

  const envValue = process.env[key];
  if (envValue !== undefined) {
    secretCache.set(cacheKey, envValue);
    return envValue;
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
 * Does NOT check the database. Use getSecret() for full resolution.
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
