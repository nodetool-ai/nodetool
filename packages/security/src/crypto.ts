/**
 * Cryptographic utilities for secret encryption and decryption.
 *
 * This module provides utilities for encrypting and decrypting secrets using
 * AES-256-GCM symmetric encryption with PBKDF2 key derivation.
 *
 * The master key is combined with user_id (as salt) to derive user-specific
 * encryption keys via PBKDF2-SHA256 with 100,000 iterations.
 */

import {
  randomBytes,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual
} from "node:crypto";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.security.crypto");

// Fernet token version byte
const FERNET_VERSION = 0x80;

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits for AES-256
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Generate a new random master key.
 *
 * @returns A base64-encoded 32-byte master key string.
 */
export function generateMasterKey(): string {
  return randomBytes(KEY_LENGTH).toString("base64");
}

/**
 * Derive an encryption key from the master key using user_id as salt.
 *
 * This ensures each user's secrets are encrypted with a unique derived key,
 * providing isolation between users even if the master key is compromised.
 *
 * @param masterKey - The master key (base64-encoded or raw string).
 * @param userId - The user ID to use as salt for key derivation.
 * @returns A 32-byte derived key as a Buffer.
 */
export function deriveKey(masterKey: string, userId: string): Buffer {
  const salt = Buffer.from(userId, "utf-8");
  return pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

/**
 * Encrypt a plaintext value using AES-256-GCM.
 *
 * The output format is: base64(iv || ciphertext || authTag)
 *
 * @param masterKey - The master key to use for encryption.
 * @param userId - The user ID to use as salt for key derivation.
 * @param plaintext - The plaintext string to encrypt.
 * @returns The encrypted value as a base64-encoded string.
 */
export function encrypt(
  masterKey: string,
  userId: string,
  plaintext: string
): string {
  const key = deriveKey(masterKey, userId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + ciphertext (variable) + authTag (16)
  const packed = Buffer.concat([iv, encrypted, authTag]);
  return packed.toString("base64");
}

/**
 * Decrypt an encrypted value using AES-256-GCM.
 *
 * @param masterKey - The master key to use for decryption.
 * @param userId - The user ID to use as salt for key derivation.
 * @param encryptedValue - The encrypted value as a base64-encoded string.
 * @returns The decrypted plaintext string.
 * @throws {Error} If the master key is incorrect or the data is corrupted.
 */
export function decrypt(
  masterKey: string,
  userId: string,
  encryptedValue: string
): string {
  const key = deriveKey(masterKey, userId);
  const packed = Buffer.from(encryptedValue, "base64");

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Failed to decrypt secret: data too short");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(
    IV_LENGTH,
    packed.length - AUTH_TAG_LENGTH
  );

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    return decrypted.toString("utf-8");
  } catch (err) {
    log.debug("AES-GCM decryption failed (may fall back to Fernet)", {
      error: String(err)
    });
    throw new Error("Failed to decrypt secret");
  }
}

/**
 * Decrypt a Fernet token encrypted by the Python side.
 *
 * Python uses: PBKDF2(master_key_bytes, user_id, 100k, 32) → fernet_key
 * Fernet = AES-128-CBC + HMAC-SHA256, token = base64url(ver|ts|iv|ct|hmac)
 *
 * @param masterKey - The master key as a base64 or base64url string.
 * @param userId - The user ID used as PBKDF2 salt.
 * @param encryptedValue - The Fernet token (base64url encoded).
 */
export function decryptFernet(
  masterKey: string,
  userId: string,
  encryptedValue: string
): string {
  // Python uses master_key.encode() — the UTF-8 bytes of the base64 string itself as PBKDF2 password
  const masterKeyBytes = Buffer.from(masterKey, "utf-8");
  const salt = Buffer.from(userId, "utf-8");
  const derived = pbkdf2Sync(
    masterKeyBytes,
    salt,
    PBKDF2_ITERATIONS,
    32,
    "sha256"
  );

  // Fernet splits the 32-byte derived key: first 16 = HMAC key, last 16 = AES-128 key
  const hmacKey = derived.subarray(0, 16);
  const aesKey = derived.subarray(16, 32);

  // Decode Fernet token from base64url
  const b64token = encryptedValue.replace(/-/g, "+").replace(/_/g, "/");
  const token = Buffer.from(
    b64token + "=".repeat((4 - (b64token.length % 4)) % 4),
    "base64"
  );

  // Token layout: version(1) + timestamp(8) + iv(16) + ciphertext(N) + hmac(32)
  if (token.length < 1 + 8 + 16 + 32) {
    throw new Error("Invalid Fernet token: too short");
  }
  if (token[0] !== 0x80) {
    throw new Error(`Invalid Fernet token version: ${token[0]}`);
  }

  const body = token.subarray(0, token.length - 32);
  const tokenHmac = token.subarray(token.length - 32);
  const iv = body.subarray(9, 25); // 1 + 8 = 9
  const ciphertext = body.subarray(25);

  // Verify HMAC-SHA256
  const expectedHmac = createHmac("sha256", hmacKey).update(body).digest();
  if (!timingSafeEqual(expectedHmac, tokenHmac)) {
    throw new Error("Invalid Fernet token: HMAC mismatch");
  }

  // Decrypt AES-128-CBC and strip PKCS7 padding
  const decipher = createDecipheriv("aes-128-cbc", aesKey, iv);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  return decrypted.toString("utf-8");
}

/**
 * Encrypt a value using Fernet (Python-compatible).
 *
 * Produces a token that Python's cryptography.Fernet can decrypt.
 * Format: base64url(version(1) | timestamp(8) | iv(16) | ciphertext(N) | hmac(32))
 *
 * @param masterKey - The master key as a base64 or utf-8 string.
 * @param userId - The user ID used as PBKDF2 salt.
 * @param plaintext - The plaintext to encrypt.
 */
export function encryptFernet(
  masterKey: string,
  userId: string,
  plaintext: string
): string {
  const masterKeyBytes = Buffer.from(masterKey, "utf-8");
  const salt = Buffer.from(userId, "utf-8");
  const derived = pbkdf2Sync(
    masterKeyBytes,
    salt,
    PBKDF2_ITERATIONS,
    32,
    "sha256"
  );

  const hmacKey = derived.subarray(0, 16);
  const aesKey = derived.subarray(16, 32);

  const iv = randomBytes(16);
  // Timestamp: seconds since epoch as big-endian uint64
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigUInt64BE(timestamp);

  // Pad plaintext to 16-byte boundary (PKCS7)
  const plaintextBuf = Buffer.from(plaintext, "utf-8");
  const padLen = 16 - (plaintextBuf.length % 16);
  const padded = Buffer.concat([plaintextBuf, Buffer.alloc(padLen, padLen)]);

  const cipher = createCipheriv("aes-128-cbc", aesKey, iv);
  cipher.setAutoPadding(false);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final()]);

  // Build body: version(1) + timestamp(8) + iv(16) + ciphertext
  const body = Buffer.concat([
    Buffer.from([FERNET_VERSION]),
    tsBuf,
    iv,
    ciphertext
  ]);

  // HMAC-SHA256 over body
  const hmac = createHmac("sha256", hmacKey).update(body).digest();

  const token = Buffer.concat([body, hmac]);
  // Encode as base64url (no padding)
  return token
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Check if a master key is valid by attempting to decrypt a test value.
 *
 * @param masterKey - The master key to validate.
 * @param testEncryptedValue - An encrypted test value to decrypt.
 * @param userId - The user ID used as salt for the test value.
 * @returns True if the master key is valid, false otherwise.
 */
export function isValidMasterKey(
  masterKey: string,
  testEncryptedValue: string,
  userId: string
): boolean {
  try {
    decrypt(masterKey, userId, testEncryptedValue);
    return true;
  } catch {
    return false;
  }
}
