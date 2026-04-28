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
import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.security.master-key");

const KEYRING_SERVICE = "nodetool";
const KEYRING_ACCOUNT = "secrets_master_key";

let cachedMasterKey: string | null = null;

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
  if (_keytarResolved) {
    return _keytarResolved;
  }
  try {
    const mod = await import("keytar");
    _keytarResolved = mod.default ?? mod;
    return _keytarResolved;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      "keytar native module failed to load. For headless deployments " +
        "(Docker, CI, Linux servers without libsecret) set the SECRETS_MASTER_KEY " +
        "environment variable to a base64-encoded 32-byte key, or set " +
        "AWS_SECRETS_MASTER_KEY_NAME to source the key from AWS Secrets Manager.",
      { error: message }
    );
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
 */
async function getFromAwsSecrets(secretName: string): Promise<string | null> {
  try {
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("Master key source failed, trying next", {
      source: "aws",
      error: message
    });
    return null;
  }
}

/**
 * Get the master encryption key (synchronous).
 *
 * Checks sources in order:
 * 1. Cached key (if previously retrieved, e.g. via initMasterKey)
 * 2. SECRETS_MASTER_KEY environment variable
 * 3. Auto-generates a new key (will not persist unless initMasterKey was called)
 *
 * For full resolution including keychain and AWS, call initMasterKey() once at startup.
 *
 * @returns The master key as a base64-encoded string.
 */
export function getMasterKey(): string {
  if (cachedMasterKey !== null) {
    return cachedMasterKey;
  }

  // 1. Check environment variable
  const envKey = process.env["SECRETS_MASTER_KEY"];
  if (envKey) {
    log.debug("Master key source", { source: "env" });
    cachedMasterKey = envKey;
    return envKey;
  }

  // 2. Auto-generate (not persisted without initMasterKey)
  log.debug("Master key source", { source: "generated" });
  const newKey = generateMasterKey();
  cachedMasterKey = newKey;
  return newKey;
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
  // Return cached key if available
  if (cachedMasterKey !== null) {
    return cachedMasterKey;
  }

  // 1. Check environment variable
  const envKey = process.env["SECRETS_MASTER_KEY"];
  if (envKey) {
    log.debug("Master key source", { source: "env" });
    cachedMasterKey = envKey;
    return envKey;
  }

  // 2. Check AWS Secrets Manager if configured
  const awsSecretName = process.env["AWS_SECRETS_MASTER_KEY_NAME"];
  if (awsSecretName) {
    const awsKey = await getFromAwsSecrets(awsSecretName);
    if (awsKey) {
      log.debug("Master key source", { source: "aws" });
      cachedMasterKey = awsKey;
      return awsKey;
    }
  }

  // 3. Try system keychain via keytar
  const keytar = _keytar ?? await loadKeytar();
  try {
    const storedKey = await keytar.getPassword(
      KEYRING_SERVICE,
      KEYRING_ACCOUNT
    );
    if (storedKey) {
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
