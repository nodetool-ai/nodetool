/**
 * Master key management with keychain and AWS Secrets Manager support.
 *
 * This module manages the master encryption key for secrets, storing it securely
 * in the system keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
 * or AWS Secrets Manager.
 *
 * Key sources (in order of precedence):
 * 1. SECRETS_MASTER_KEY environment variable
 * 2. AWS Secrets Manager (if AWS_SECRETS_MASTER_KEY_NAME env var set)
 * 3. System keychain via keytar
 * 4. Auto-generated key (persisted to keychain when available)
 *
 * NOTE on encryption compatibility: TS uses AES-256-GCM while Python uses Fernet.
 * Secrets encrypted in one runtime cannot be decrypted in the other.
 * New secrets must be created via the appropriate runtime's endpoints.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand
} from "@aws-sdk/client-secrets-manager";
import { generateMasterKey } from "./crypto.js";
import { createLogger } from "@nodetool-ai/config";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not behavior
const log = createLogger("nodetool.security.master-key");

const KEYRING_SERVICE = "nodetool";
const KEYRING_ACCOUNT = "secrets_master_key";

let cachedMasterKey: string | null = null;

/** In-flight resolution promise, used to de-duplicate concurrent first-run inits. */
let initInFlight: Promise<string> | null = null;

/** Minimal keytar interface for the methods we use. */
interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(
    service: string,
    account: string,
    password: string
  ): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

/**
 * Thrown when the system keychain cannot be accessed. Callers can detect this
 * specifically (vs other startup failures) to decide whether re-prompting the
 * user for keychain access makes sense.
 */
export class KeychainAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeychainAccessError";
  }
}

function keychainAccessError(message: string): KeychainAccessError {
  return new KeychainAccessError(
    `${message}. Allow NodeTool access to the system keychain when prompted.`
  );
}

/** Lazy-load keytar. Keychain failures are fatal: no generated fallback key. */
let _keytarResolved: KeytarModule | null = null;
async function loadKeytar(): Promise<KeytarModule> {
  // Stryker disable next-line ConditionalExpression,BlockStatement: cache fast-path — re-importing yields the same module, so this mutant is behaviorally equivalent
  if (_keytarResolved) {
    return _keytarResolved;
  }
  try {
    const mod = await import("keytar");
    _keytarResolved = mod.default ?? mod;
    return _keytarResolved;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Stryker disable all: diagnostic log, not behavior
    log.error(
      "keytar native module failed to load. For headless deployments " +
        "(Docker, CI, Linux servers without libsecret) set the SECRETS_MASTER_KEY " +
        "environment variable to a base64-encoded 32-byte key, or set " +
        "AWS_SECRETS_MASTER_KEY_NAME to source the key from AWS Secrets Manager.",
      { error: message }
    );
    // Stryker restore all
    throw keychainAccessError(`Unable to load system keychain backend: ${message}`);
  }
}

/** Active keytar implementation (can be overridden in tests). */
let _keytar: KeytarModule | null = null;

/**
 * Replace the keytar implementation (for testing / dependency injection).
 */
export function setKeytarLoader(keytarImpl: KeytarModule): void {
  _keytar = keytarImpl;
  _keytarResolved = keytarImpl;
}

/**
 * Restore the default keytar implementation (for testing).
 */
export function resetKeytarLoader(): void {
  _keytar = null;
  _keytarResolved = null;
}

/**
 * Retrieve master key from AWS Secrets Manager.
 *
 * Only attempted if AWS_SECRETS_MASTER_KEY_NAME environment variable is set.
 *
 * Errors are NOT swallowed here: when AWS is the configured key source, a
 * transient failure must surface to the caller rather than silently falling
 * back to a generated key (which would orphan every existing secret). Returns
 * null only when the secret exists but carries no value.
 */
async function getFromAwsSecrets(secretName: string): Promise<string | null> {
  const region = process.env["AWS_REGION"] ?? "us-east-1";
  const client = new SecretsManagerClient({ region });

  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );

  if (response.SecretString) {
    return response.SecretString;
  }
  if (response.SecretBinary) {
    return Buffer.from(response.SecretBinary).toString("utf-8");
  }
  return null;
}

/**
 * Get the master encryption key (synchronous).
 *
 * Checks sources in order:
 * 1. Cached key (set previously by initMasterKey, setMasterKey, or a prior
 *    getMasterKey hit on SECRETS_MASTER_KEY).
 * 2. SECRETS_MASTER_KEY environment variable.
 *
 * Throws if neither is available. Callers MUST call {@link initMasterKey}
 * once at process startup (which loads from keychain / AWS / env and
 * persists a fresh key on first run) before the first sync access.
 * Auto-generating an ephemeral key here would silently encrypt secrets
 * with a value that disappears on exit — making them undecryptable on
 * the next launch — so we surface the missing-init explicitly instead.
 *
 * @returns The master key as a base64-encoded string.
 * @throws  If the key has not been initialized.
 */
export function getMasterKey(): string {
  if (cachedMasterKey !== null) {
    return cachedMasterKey;
  }

  const envKey = process.env["SECRETS_MASTER_KEY"];
  if (envKey) {
    // Stryker disable next-line all: diagnostic log, not behavior
    log.debug("Master key source", { source: "env" });
    cachedMasterKey = envKey;
    return envKey;
  }

  throw new Error(
    "Master key is not initialized. Call `initMasterKey()` once at startup " +
      "(loads from system keychain / AWS Secrets Manager / SECRETS_MASTER_KEY) " +
      "before any synchronous secret access. Auto-generating a key here would " +
      "silently encrypt secrets with a value that disappears on process exit."
  );
}

/**
 * Initialize the master key from all available sources (async).
 *
 * Should be called once at application startup to resolve the master key
 * from keychain or AWS Secrets Manager. After this call, getMasterKey()
 * will return the resolved key synchronously.
 *
 * Resolution order:
 * 1. SECRETS_MASTER_KEY environment variable
 * 2. AWS Secrets Manager (if AWS_SECRETS_MASTER_KEY_NAME is set)
 * 3. System keychain via keytar
 * 4. Auto-generate and persist to keychain
 *
 * @returns The master key as a base64-encoded string.
 */
export async function initMasterKey(): Promise<string> {
  if (cachedMasterKey !== null) {
    return cachedMasterKey;
  }

  // Single-flight: concurrent first-run callers share one resolution. Without
  // this, each would independently generate a *different* key and race to
  // persist it, leaving the cache and keychain inconsistent and orphaning any
  // secrets encrypted under the losing key.
  if (initInFlight !== null) {
    return initInFlight;
  }

  initInFlight = resolveMasterKey();
  try {
    return await initInFlight;
  } finally {
    initInFlight = null;
  }
}

/** Resolve the master key from all sources. See {@link initMasterKey}. */
async function resolveMasterKey(): Promise<string> {
  // 1. Check environment variable
  const envKey = process.env["SECRETS_MASTER_KEY"];
  if (envKey) {
    // Stryker disable next-line all: diagnostic log, not behavior
    log.debug("Master key source", { source: "env" });
    cachedMasterKey = envKey;
    return envKey;
  }

  // 2. AWS Secrets Manager, if configured. When AWS is the declared source,
  // any failure (or an empty secret) is fatal: falling through to a freshly
  // generated keychain key would silently orphan every existing secret.
  const awsSecretName = process.env["AWS_SECRETS_MASTER_KEY_NAME"];
  if (awsSecretName) {
    let awsKey: string | null;
    try {
      awsKey = await getFromAwsSecrets(awsSecretName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to load master key from AWS Secrets Manager (secret ` +
          `"${awsSecretName}"): ${message}. AWS is the configured master key ` +
          `source; refusing to fall back to a generated key that would make ` +
          `existing secrets undecryptable.`
      );
    }
    if (!awsKey) {
      throw new Error(
        `AWS Secrets Manager returned no value for master key secret ` +
          `"${awsSecretName}". AWS is the configured master key source; ` +
          `refusing to fall back to a generated key that would make existing ` +
          `secrets undecryptable.`
      );
    }
    // Stryker disable next-line all: diagnostic log, not behavior
    log.debug("Master key source", { source: "aws" });
    cachedMasterKey = awsKey;
    return awsKey;
  }

  // 3. Try system keychain via keytar
  const keytar = _keytar ?? (await loadKeytar());
  try {
    const storedKey = await keytar.getPassword(
      KEYRING_SERVICE,
      KEYRING_ACCOUNT
    );
    if (storedKey) {
      // Stryker disable next-line all: diagnostic log, not behavior
    log.debug("Master key source", { source: "keychain" });
      cachedMasterKey = storedKey;
      return storedKey;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw keychainAccessError(`Unable to read master key from system keychain: ${message}`);
  }

  // 4. Auto-generate and persist to keychain. Persisting is mandatory; using
  // an unpersisted generated key would make encrypted secrets unrecoverable on
  // the next launch.
  const newKey = generateMasterKey();
  try {
    await keytar.setPassword(KEYRING_SERVICE, KEYRING_ACCOUNT, newKey);
    // Stryker disable next-line all: diagnostic log, not behavior
    log.info("Master key generated and stored");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw keychainAccessError(`Unable to store master key in system keychain: ${message}`);
  }
  cachedMasterKey = newKey;
  return newKey;
}

/**
 * Clear the cached master key.
 *
 * Forces the next call to getMasterKey() or initMasterKey() to
 * re-read from environment, AWS, or keychain.
 */
export function clearMasterKeyCache(): void {
  cachedMasterKey = null;
}

/**
 * Set a specific master key (useful for testing or migration).
 *
 * @param masterKey - The master key to use.
 */
export function setMasterKey(masterKey: string): void {
  cachedMasterKey = masterKey;
}

/**
 * Set the master key and persist it to the system keychain.
 *
 * @param masterKey - The master key to set (base64-encoded string).
 * @throws {Error} If keychain write fails.
 */
export async function setMasterKeyPersistent(masterKey: string): Promise<void> {
  const keytar = _keytar ?? await loadKeytar();
  await keytar.setPassword(KEYRING_SERVICE, KEYRING_ACCOUNT, masterKey);
  cachedMasterKey = masterKey;
}

/**
 * Delete the master key from the system keychain.
 *
 * WARNING: This will make all encrypted secrets inaccessible!
 *
 * @returns True if the key was deleted, false otherwise.
 * @throws {Error} If keychain deletion fails.
 */
export async function deleteMasterKey(): Promise<boolean> {
  const keytar = _keytar ?? await loadKeytar();
  const deleted = await keytar.deletePassword(
    KEYRING_SERVICE,
    KEYRING_ACCOUNT
  );
  cachedMasterKey = null;
  return deleted;
}

/**
 * Check if the master key is being sourced from an environment variable.
 *
 * @returns True if SECRETS_MASTER_KEY environment variable is set.
 */
export function isUsingEnvKey(): boolean {
  return process.env["SECRETS_MASTER_KEY"] !== undefined;
}

/**
 * Check if the master key should be sourced from AWS Secrets Manager.
 *
 * @returns True if AWS_SECRETS_MASTER_KEY_NAME environment variable is set.
 */
export function isUsingAwsKey(): boolean {
  return process.env["AWS_SECRETS_MASTER_KEY_NAME"] !== undefined;
}
