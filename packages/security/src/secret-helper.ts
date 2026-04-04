/**
 * Helper functions for retrieving secrets at runtime.
 *
 * Resolution order for getSecret():
 * 1. Forced env priority keys -> environment variable
 * 2. Local cache
 * 3. Database (encrypted Secret model) -- if userId provided and Secret model available
 * 4. Environment variable
 * 5. Default value
 *
 * NOTE on encryption compatibility: TS uses AES-256-GCM while Python uses Fernet.
 * Secrets encrypted in Python cannot be decrypted in TS and vice versa.
 * New secrets must be created via the TS endpoints for TS runtime access.
 */

import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.security.secret-helper");

/** Cache for resolved secrets: "userId:key" -> value */
const secretCache = new Map<string, string | null>();

/** Keys that should always prioritize environment variables */
const FORCE_ENV_PRIORITY = new Set([
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SERVER_AUTH_TOKEN"
]);

/**
 * Optional Secret model loader.
 *
 * We use dynamic import to avoid a hard dependency on @nodetool/models
 * from the security package. If the models package is not available,
 * database lookups are silently skipped.
 */
type SecretModel = {
  find(
    userId: string,
    key: string
  ): Promise<{ getDecryptedValue(): Promise<string> } | null>;
};

let _secretModelPromise: Promise<SecretModel | null> | null = null;

async function loadSecretModel(): Promise<SecretModel | null> {
  if (_secretModelPromise === null) {
    _secretModelPromise = (async () => {
      try {
        // Dynamic import with variable to prevent TS from resolving the module
        const moduleName = "@nodetool/models/secret";
        const mod = await import(/* webpackIgnore: true */ moduleName);
        return mod.Secret as SecretModel;
      } catch {
        return null;
      }
    })();
  }
  return _secretModelPromise;
}

/**
 * Reset the Secret model loader (for testing).
 */
export function resetSecretModelLoader(): void {
  _secretModelPromise = null;
}

/**
 * Set a custom Secret model loader (for testing / dependency injection).
 */
export function setSecretModelLoader(
  loader: Promise<SecretModel | null>
): void {
  _secretModelPromise = loader;
}

/**
 * Clear a specific secret from the local cache.
 *
 * @param userId - The user ID.
 * @param key - The secret key.
 */
export function clearSecretCache(userId: string, key: string): void {
  secretCache.delete(`${userId}:${key}`);
}

/**
 * Clear all cached secrets.
 */
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
 *
 * @param key - The secret key (e.g., "OPENAI_API_KEY").
 * @param userId - The user ID (optional, used for cache scoping and DB lookup).
 * @param defaultValue - Default value if not found.
 * @returns The secret value, or null if not found.
 */
export async function getSecret(
  key: string,
  userId?: string,
  defaultValue?: string
): Promise<string | null> {
  const resolvedUserId = userId ?? "default";

  // 1. Check forced environment priority
  if (FORCE_ENV_PRIORITY.has(key)) {
    const envVal = process.env[key];
    if (envVal !== undefined) {
      return envVal;
    }
  }

  // 2. Check cache
  const cacheKey = `${resolvedUserId}:${key}`;
  if (secretCache.has(cacheKey)) {
    return secretCache.get(cacheKey) ?? null;
  }

  // 3. Check database (if userId provided)
  if (userId) {
    try {
      const SecretModel = await loadSecretModel();
      if (SecretModel) {
        const secret = await SecretModel.find(userId, key);
        if (secret) {
          const value = await secret.getDecryptedValue();
          if (value !== null && value !== undefined) {
            secretCache.set(cacheKey, value);
            return value;
          }
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

  // 4. Check environment variable
  const envValue = process.env[key];
  if (envValue !== undefined) {
    secretCache.set(cacheKey, envValue);
    return envValue;
  }

  // 5. Return default
  if (defaultValue !== undefined) {
    return defaultValue;
  }

  return null;
}

/**
 * Get a required secret value for a user.
 *
 * Same as getSecret() but throws if the secret is not found.
 *
 * @param key - The secret key.
 * @param userId - The user ID (optional).
 * @returns The secret value.
 * @throws {Error} If the secret is not found.
 */
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

/**
 * Check if a secret exists for a user.
 *
 * @param key - The secret key.
 * @param userId - The user ID (optional).
 * @returns True if the secret exists (in env, cache, or database), false otherwise.
 */
export async function hasSecret(
  key: string,
  userId?: string
): Promise<boolean> {
  const resolvedUserId = userId ?? "default";

  // Check environment
  if (process.env[key] !== undefined) {
    return true;
  }

  // Check cache
  const cacheKey = `${resolvedUserId}:${key}`;
  if (secretCache.has(cacheKey)) {
    return secretCache.get(cacheKey) !== null;
  }

  // Check database
  if (userId) {
    try {
      const SecretModel = await loadSecretModel();
      if (SecretModel) {
        const secret = await SecretModel.find(userId, key);
        if (secret) {
          const value = await secret.getDecryptedValue();
          secretCache.set(cacheKey, value);
          return true;
        }
      }
    } catch {
      // Database lookup failed
    }
  }

  return false;
}

/**
 * Get a secret value synchronously from environment variables only.
 *
 * This does NOT check the database. Use getSecret() for full resolution.
 *
 * @param key - The secret key.
 * @param defaultValue - Default value if not found.
 * @returns The secret value, or null/default if not found.
 */
export function getSecretSync(
  key: string,
  defaultValue?: string
): string | null {
  // Check forced env priority
  if (FORCE_ENV_PRIORITY.has(key)) {
    const envVal = process.env[key];
    if (envVal !== undefined) {
      return envVal;
    }
  }

  // Check environment variable
  const envValue = process.env[key];
  if (envValue !== undefined) {
    return envValue;
  }

  // Return default
  if (defaultValue !== undefined) {
    return defaultValue;
  }

  return null;
}
