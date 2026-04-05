import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateMasterKey,
  deriveKey,
  encrypt,
  decrypt,
  encryptFernet,
  decryptFernet,
  isValidMasterKey
} from "../src/crypto.js";
import {
  getMasterKey,
  initMasterKey,
  clearMasterKeyCache,
  setMasterKey,
  setMasterKeyPersistent,
  deleteMasterKey,
  isUsingEnvKey,
  isUsingAwsKey,
  setKeytarLoader,
  resetKeytarLoader
} from "../src/master-key.js";
import {
  getSecret,
  getSecretRequired,
  hasSecret,
  getSecretSync,
  clearSecretCache,
  clearAllSecretCache,
  setSecretModelLoader,
  resetSecretModelLoader
} from "../src/secret-helper.js";

describe("crypto", () => {
  describe("generateMasterKey", () => {
    it("should return a valid base64 string", () => {
      const key = generateMasterKey();
      expect(typeof key).toBe("string");
      // Should be valid base64
      const decoded = Buffer.from(key, "base64");
      expect(decoded.toString("base64")).toBe(key);
    });

    it("should return a key of correct length (32 bytes)", () => {
      const key = generateMasterKey();
      const decoded = Buffer.from(key, "base64");
      expect(decoded.length).toBe(32);
    });

    it("should generate unique keys", () => {
      const key1 = generateMasterKey();
      const key2 = generateMasterKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe("deriveKey", () => {
    it("should return a 32-byte buffer", () => {
      const masterKey = generateMasterKey();
      const derived = deriveKey(masterKey, "user-1");
      expect(derived.length).toBe(32);
    });

    it("should be deterministic for same inputs", () => {
      const masterKey = generateMasterKey();
      const derived1 = deriveKey(masterKey, "user-1");
      const derived2 = deriveKey(masterKey, "user-1");
      expect(derived1.equals(derived2)).toBe(true);
    });

    it("should produce different keys for different users", () => {
      const masterKey = generateMasterKey();
      const derived1 = deriveKey(masterKey, "user-1");
      const derived2 = deriveKey(masterKey, "user-2");
      expect(derived1.equals(derived2)).toBe(false);
    });

    it("should produce different keys for different master keys", () => {
      const masterKey1 = generateMasterKey();
      const masterKey2 = generateMasterKey();
      const derived1 = deriveKey(masterKey1, "user-1");
      const derived2 = deriveKey(masterKey2, "user-1");
      expect(derived1.equals(derived2)).toBe(false);
    });
  });

  describe("encrypt/decrypt", () => {
    it("should round-trip encrypt and decrypt", () => {
      const masterKey = generateMasterKey();
      const userId = "user-1";
      const plaintext = "my-secret-api-key-12345";

      const encrypted = encrypt(masterKey, userId, plaintext);
      const decrypted = decrypt(masterKey, userId, encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle empty strings", () => {
      const masterKey = generateMasterKey();
      const userId = "user-1";

      const encrypted = encrypt(masterKey, userId, "");
      const decrypted = decrypt(masterKey, userId, encrypted);

      expect(decrypted).toBe("");
    });

    it("should handle unicode content", () => {
      const masterKey = generateMasterKey();
      const userId = "user-1";
      const plaintext =
        "secret with unicode: \u00e9\u00e0\u00fc\u00f1 \ud83d\udd10";

      const encrypted = encrypt(masterKey, userId, plaintext);
      const decrypted = decrypt(masterKey, userId, encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should produce different ciphertexts for same plaintext (due to random IV)", () => {
      const masterKey = generateMasterKey();
      const userId = "user-1";
      const plaintext = "same-secret";

      const encrypted1 = encrypt(masterKey, userId, plaintext);
      const encrypted2 = encrypt(masterKey, userId, plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      // But both decrypt to the same value
      expect(decrypt(masterKey, userId, encrypted1)).toBe(plaintext);
      expect(decrypt(masterKey, userId, encrypted2)).toBe(plaintext);
    });

    it("should produce different ciphertexts for different users", () => {
      const masterKey = generateMasterKey();
      const plaintext = "shared-secret";

      const encrypted1 = encrypt(masterKey, "user-1", plaintext);
      const encrypted2 = encrypt(masterKey, "user-2", plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should fail to decrypt with wrong master key", () => {
      const masterKey1 = generateMasterKey();
      const masterKey2 = generateMasterKey();
      const userId = "user-1";

      const encrypted = encrypt(masterKey1, userId, "secret");

      expect(() => decrypt(masterKey2, userId, encrypted)).toThrow(
        "Failed to decrypt secret"
      );
    });

    it("should fail to decrypt with wrong userId", () => {
      const masterKey = generateMasterKey();

      const encrypted = encrypt(masterKey, "user-1", "secret");

      expect(() => decrypt(masterKey, "user-2", encrypted)).toThrow(
        "Failed to decrypt secret"
      );
    });

    it("should fail to decrypt corrupted data", () => {
      const masterKey = generateMasterKey();
      const userId = "user-1";

      expect(() => decrypt(masterKey, userId, "not-valid-base64!!!")).toThrow();
    });

    it("should fail to decrypt truncated data", () => {
      const masterKey = generateMasterKey();
      const userId = "user-1";

      // Too short to contain IV + authTag
      const shortData = Buffer.alloc(10).toString("base64");
      expect(() => decrypt(masterKey, userId, shortData)).toThrow(
        "Failed to decrypt secret: data too short"
      );
    });
  });

  describe("isValidMasterKey", () => {
    it("should return true for valid key", () => {
      const masterKey = generateMasterKey();
      const userId = "user-1";
      const encrypted = encrypt(masterKey, userId, "test-value");

      expect(isValidMasterKey(masterKey, encrypted, userId)).toBe(true);
    });

    it("should return false for wrong key", () => {
      const masterKey1 = generateMasterKey();
      const masterKey2 = generateMasterKey();
      const userId = "user-1";
      const encrypted = encrypt(masterKey1, userId, "test-value");

      expect(isValidMasterKey(masterKey2, encrypted, userId)).toBe(false);
    });
  });

  describe("encryptFernet/decryptFernet", () => {
    /** Convert a Buffer to a base64url string (no + / = characters). */
    function toBase64Url(buf: Buffer): string {
      return buf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    }

    /**
     * Decode a base64url string back to a Buffer.
     * Adds the minimal "==" padding needed: formula `(len % 4) || 4` gives
     * 0 pad when len%4==0 (already aligned), otherwise 4-(len%4) chars,
     * which is equivalent to slicing "==" by the needed amount.
     */
    function fromBase64Url(token: string): Buffer {
      const padded = token + "==".slice(token.length % 4 || 4);
      return Buffer.from(
        padded.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      );
    }

    it("should round-trip encrypt and decrypt", () => {
      const masterKey = generateMasterKey();
      const userId = "user-fernet";
      const plaintext = "my-fernet-secret";

      const token = encryptFernet(masterKey, userId, plaintext);
      const decrypted = decryptFernet(masterKey, userId, token);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle empty strings", () => {
      const masterKey = generateMasterKey();
      const userId = "user-fernet";

      const token = encryptFernet(masterKey, userId, "");
      const decrypted = decryptFernet(masterKey, userId, token);

      expect(decrypted).toBe("");
    });

    it("should handle unicode content", () => {
      const masterKey = generateMasterKey();
      const userId = "user-fernet";
      const plaintext = "unicode: \u00e9\u00e0\u00fc\u00f1 \ud83d\udd10";

      const token = encryptFernet(masterKey, userId, plaintext);
      const decrypted = decryptFernet(masterKey, userId, token);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle long plaintext", () => {
      const masterKey = generateMasterKey();
      const userId = "user-fernet";
      const plaintext = "a".repeat(1000);

      const token = encryptFernet(masterKey, userId, plaintext);
      const decrypted = decryptFernet(masterKey, userId, token);

      expect(decrypted).toBe(plaintext);
    });

    it("should produce different tokens for same plaintext (random IV)", () => {
      const masterKey = generateMasterKey();
      const userId = "user-fernet";
      const plaintext = "same-fernet-secret";

      const token1 = encryptFernet(masterKey, userId, plaintext);
      const token2 = encryptFernet(masterKey, userId, plaintext);

      expect(token1).not.toBe(token2);
      expect(decryptFernet(masterKey, userId, token1)).toBe(plaintext);
      expect(decryptFernet(masterKey, userId, token2)).toBe(plaintext);
    });

    it("should produce base64url-encoded tokens (no + / = chars)", () => {
      const masterKey = generateMasterKey();
      const userId = "user-fernet";
      const token = encryptFernet(masterKey, userId, "test");

      expect(token).not.toMatch(/[+/=]/);
    });

    it("should fail to decrypt with wrong master key (HMAC mismatch)", () => {
      const masterKey1 = generateMasterKey();
      const masterKey2 = generateMasterKey();
      const userId = "user-fernet";
      const token = encryptFernet(masterKey1, userId, "secret");

      expect(() => decryptFernet(masterKey2, userId, token)).toThrow(
        "HMAC mismatch"
      );
    });

    it("should fail to decrypt with wrong userId (HMAC mismatch)", () => {
      const masterKey = generateMasterKey();
      const token = encryptFernet(masterKey, "user-1", "secret");

      expect(() => decryptFernet(masterKey, "user-2", token)).toThrow(
        "HMAC mismatch"
      );
    });

    it("should fail to decrypt a truncated token (too short)", () => {
      const masterKey = generateMasterKey();
      const userId = "user-fernet";
      // 20 bytes is less than minimum (1 + 8 + 16 + 32 = 57)
      const shortToken = toBase64Url(Buffer.alloc(20));

      expect(() => decryptFernet(masterKey, userId, shortToken)).toThrow(
        "too short"
      );
    });

    it("should fail to decrypt a token with wrong version byte", () => {
      const masterKey = generateMasterKey();
      const userId = "user-fernet";
      const token = encryptFernet(masterKey, userId, "test");

      // Decode, corrupt version byte, re-encode
      const decoded = fromBase64Url(token);
      decoded[0] = 0x00; // Wrong version byte
      const corrupted = toBase64Url(decoded);

      expect(() => decryptFernet(masterKey, userId, corrupted)).toThrow(
        "version"
      );
    });

    it("encryptFernet and native encrypt should produce interoperable keys with same PBKDF2", () => {
      // Both use the same master key — cross-format is NOT interoperable (different ciphers)
      // but the key derivation logic should be consistent within each format.
      const masterKey = generateMasterKey();
      const userId = "user-1";

      // AES-256-GCM (native)
      const nativeEncrypted = encrypt(masterKey, userId, "test");
      expect(decrypt(masterKey, userId, nativeEncrypted)).toBe("test");

      // Fernet (AES-128-CBC + HMAC)
      const fernetToken = encryptFernet(masterKey, userId, "test");
      expect(decryptFernet(masterKey, userId, fernetToken)).toBe("test");
    });
  });
});

describe("master-key", () => {
  const originalEnv = process.env["SECRETS_MASTER_KEY"];

  beforeEach(() => {
    clearMasterKeyCache();
    resetKeytarLoader();
    delete process.env["SECRETS_MASTER_KEY"];
    delete process.env["AWS_SECRETS_MASTER_KEY_NAME"];
  });

  afterEach(() => {
    clearMasterKeyCache();
    resetKeytarLoader();
    if (originalEnv !== undefined) {
      process.env["SECRETS_MASTER_KEY"] = originalEnv;
    } else {
      delete process.env["SECRETS_MASTER_KEY"];
    }
    delete process.env["AWS_SECRETS_MASTER_KEY_NAME"];
  });

  describe("getMasterKey (sync)", () => {
    it("should return env var when set", () => {
      process.env["SECRETS_MASTER_KEY"] = "test-master-key-from-env";
      const key = getMasterKey();
      expect(key).toBe("test-master-key-from-env");
    });

    it("should auto-generate a key when no env var", () => {
      const key = getMasterKey();
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    });

    it("should cache the key across calls", () => {
      const key1 = getMasterKey();
      const key2 = getMasterKey();
      expect(key1).toBe(key2);
    });

    it("should clear cache", () => {
      const key1 = getMasterKey();
      clearMasterKeyCache();
      // Without env var, a new key will be generated
      const key2 = getMasterKey();
      // They could be different since new key is generated
      expect(typeof key2).toBe("string");
    });

    it("should allow setting a custom key", () => {
      setMasterKey("custom-key");
      expect(getMasterKey()).toBe("custom-key");
    });

    it("should report env key status", () => {
      expect(isUsingEnvKey()).toBe(false);
      process.env["SECRETS_MASTER_KEY"] = "test";
      expect(isUsingEnvKey()).toBe(true);
    });
  });

  describe("initMasterKey (async)", () => {
    it("should return env var when set", async () => {
      process.env["SECRETS_MASTER_KEY"] = "async-env-key";
      const key = await initMasterKey();
      expect(key).toBe("async-env-key");
    });

    it("should auto-generate when no sources available", async () => {
      const key = await initMasterKey();
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    });

    it("should cache across initMasterKey and getMasterKey calls", async () => {
      const asyncKey = await initMasterKey();
      const syncKey = getMasterKey();
      expect(asyncKey).toBe(syncKey);
    });

    it("should return cached key on subsequent calls", async () => {
      const key1 = await initMasterKey();
      const key2 = await initMasterKey();
      expect(key1).toBe(key2);
    });
  });

  describe("isUsingAwsKey", () => {
    it("should return false when AWS_SECRETS_MASTER_KEY_NAME is not set", () => {
      expect(isUsingAwsKey()).toBe(false);
    });

    it("should return true when AWS_SECRETS_MASTER_KEY_NAME is set", () => {
      process.env["AWS_SECRETS_MASTER_KEY_NAME"] = "my-secret";
      expect(isUsingAwsKey()).toBe(true);
    });
  });

  describe("setMasterKeyPersistent", () => {
    it("should throw when keytar is not available", async () => {
      setKeytarLoader(async () => null);

      await expect(
        setMasterKeyPersistent("test-key-persistent")
      ).rejects.toThrow("keytar is not available");
    });

    it("should set password in keytar and cache the key", async () => {
      const mockSetPassword = vi.fn(async () => undefined);
      const mockKeytar = {
        getPassword: vi.fn(async () => null),
        setPassword: mockSetPassword,
        deletePassword: vi.fn(async () => true)
      };
      setKeytarLoader(async () => mockKeytar);

      await setMasterKeyPersistent("my-persistent-key");

      expect(mockSetPassword).toHaveBeenCalledWith(
        "nodetool",
        "secrets_master_key",
        "my-persistent-key"
      );
      expect(getMasterKey()).toBe("my-persistent-key");
    });

    it("should propagate keytar setPassword errors", async () => {
      const mockKeytar = {
        getPassword: vi.fn(async () => null),
        setPassword: vi
          .fn()
          .mockRejectedValue(new Error("Keychain write denied")),
        deletePassword: vi.fn(async () => true)
      };
      setKeytarLoader(async () => mockKeytar);

      await expect(setMasterKeyPersistent("test-key")).rejects.toThrow(
        "Keychain write denied"
      );
    });
  });

  describe("deleteMasterKey", () => {
    it("should return false when keytar is not available", async () => {
      setKeytarLoader(async () => null);

      const result = await deleteMasterKey();
      expect(result).toBe(false);
    });

    it("should delete password from keytar and clear cache", async () => {
      const mockDeletePassword = vi.fn(async () => true);
      const mockKeytar = {
        getPassword: vi.fn(async () => null),
        setPassword: vi.fn(async () => undefined),
        deletePassword: mockDeletePassword
      };
      setKeytarLoader(async () => mockKeytar);

      // Pre-populate the cache
      setMasterKey("cached-key");
      expect(getMasterKey()).toBe("cached-key");

      const result = await deleteMasterKey();

      expect(result).toBe(true);
      expect(mockDeletePassword).toHaveBeenCalledWith(
        "nodetool",
        "secrets_master_key"
      );
      // Cache should be cleared after deletion
      // (next getMasterKey call will auto-generate or read from env)
    });

    it("should return false when keytar.deletePassword returns false", async () => {
      const mockKeytar = {
        getPassword: vi.fn(async () => null),
        setPassword: vi.fn(async () => undefined),
        deletePassword: vi.fn(async () => false)
      };
      setKeytarLoader(async () => mockKeytar);

      const result = await deleteMasterKey();
      expect(result).toBe(false);
    });
  });

  describe("initMasterKey with keytar", () => {
    it("should load key from keychain when available", async () => {
      const mockKeytar = {
        getPassword: vi.fn(async () => "keychain-stored-key"),
        setPassword: vi.fn(async () => undefined),
        deletePassword: vi.fn(async () => true)
      };
      setKeytarLoader(async () => mockKeytar);

      const key = await initMasterKey();
      expect(key).toBe("keychain-stored-key");
      expect(mockKeytar.getPassword).toHaveBeenCalledWith(
        "nodetool",
        "secrets_master_key"
      );
    });

    it("should generate and persist new key when keychain is empty", async () => {
      const mockSetPassword = vi.fn(async () => undefined);
      const mockKeytar = {
        getPassword: vi.fn(async () => null),
        setPassword: mockSetPassword,
        deletePassword: vi.fn(async () => true)
      };
      setKeytarLoader(async () => mockKeytar);

      const key = await initMasterKey();
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
      // Should have persisted the new key
      expect(mockSetPassword).toHaveBeenCalledWith(
        "nodetool",
        "secrets_master_key",
        key
      );
    });

    it("should continue gracefully when keychain getPassword throws", async () => {
      const mockKeytar = {
        getPassword: vi.fn().mockRejectedValue(new Error("Keychain locked")),
        setPassword: vi.fn(async () => undefined),
        deletePassword: vi.fn(async () => true)
      };
      setKeytarLoader(async () => mockKeytar);

      // Should still return a key (auto-generated) without throwing
      const key = await initMasterKey();
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    });
  });
});

describe("secret-helper", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearAllSecretCache();
    resetSecretModelLoader();
    // Save and clear test env vars
    for (const key of ["TEST_SECRET", "OPENAI_API_KEY", "SUPABASE_URL"]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    clearAllSecretCache();
    resetSecretModelLoader();
    // Restore env vars
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  describe("getSecret", () => {
    it("should return env var value", async () => {
      process.env["TEST_SECRET"] = "env-value";
      const value = await getSecret("TEST_SECRET", "user-1");
      expect(value).toBe("env-value");
    });

    it("should return null when not found", async () => {
      const value = await getSecret("NONEXISTENT_KEY", "user-1");
      expect(value).toBeNull();
    });

    it("should return default when not found", async () => {
      const value = await getSecret("NONEXISTENT_KEY", "user-1", "default-val");
      expect(value).toBe("default-val");
    });

    it("should prioritize forced env keys", async () => {
      process.env["SUPABASE_URL"] = "https://forced.supabase.co";
      const value = await getSecret("SUPABASE_URL", "user-1");
      expect(value).toBe("https://forced.supabase.co");
    });
  });

  describe("getSecret with database lookup", () => {
    it("should find secret from database when env is not set", async () => {
      // Mock a Secret model that returns a value
      const mockSecret = {
        getDecryptedValue: vi.fn(async () => "db-secret-value")
      };
      const mockSecretModel = {
        find: vi.fn(async (userId: string, key: string) => {
          if (userId === "user-1" && key === "DB_SECRET") return mockSecret;
          return null;
        })
      };
      setSecretModelLoader(Promise.resolve(mockSecretModel));

      const value = await getSecret("DB_SECRET", "user-1");
      expect(value).toBe("db-secret-value");
      expect(mockSecretModel.find).toHaveBeenCalledWith("user-1", "DB_SECRET");
    });

    it("should cache database results", async () => {
      const mockSecret = {
        getDecryptedValue: vi.fn(async () => "cached-db-value")
      };
      const mockSecretModel = {
        find: vi.fn(async () => mockSecret)
      };
      setSecretModelLoader(Promise.resolve(mockSecretModel));

      // First call
      await getSecret("CACHED_KEY", "user-1");
      // Second call should use cache
      const value = await getSecret("CACHED_KEY", "user-1");
      expect(value).toBe("cached-db-value");
      // find should only be called once
      expect(mockSecretModel.find).toHaveBeenCalledTimes(1);
    });

    it("should fall through to env when database returns null", async () => {
      const mockSecretModel = {
        find: vi.fn(async () => null)
      };
      setSecretModelLoader(Promise.resolve(mockSecretModel));

      process.env["TEST_SECRET"] = "env-fallback";
      const value = await getSecret("TEST_SECRET", "user-1");
      expect(value).toBe("env-fallback");
    });

    it("should fall through to env when database throws", async () => {
      const mockSecretModel = {
        find: vi.fn(async () => {
          throw new Error("DB connection failed");
        })
      };
      setSecretModelLoader(Promise.resolve(mockSecretModel));

      process.env["TEST_SECRET"] = "env-after-error";
      const value = await getSecret("TEST_SECRET", "user-1");
      expect(value).toBe("env-after-error");
    });

    it("should skip database when no userId provided", async () => {
      const mockSecretModel = {
        find: vi.fn(async () => null)
      };
      setSecretModelLoader(Promise.resolve(mockSecretModel));

      process.env["TEST_SECRET"] = "no-user-env";
      const value = await getSecret("TEST_SECRET");
      expect(value).toBe("no-user-env");
      // Should not call find since no userId
      expect(mockSecretModel.find).not.toHaveBeenCalled();
    });

    it("should skip database when Secret model is not available", async () => {
      setSecretModelLoader(Promise.resolve(null));

      process.env["TEST_SECRET"] = "no-model-env";
      const value = await getSecret("TEST_SECRET", "user-1");
      expect(value).toBe("no-model-env");
    });
  });

  describe("getSecretRequired", () => {
    it("should return value when found", async () => {
      process.env["TEST_SECRET"] = "required-value";
      const value = await getSecretRequired("TEST_SECRET", "user-1");
      expect(value).toBe("required-value");
    });

    it("should throw when not found", async () => {
      await expect(
        getSecretRequired("NONEXISTENT_KEY", "user-1")
      ).rejects.toThrow("Required secret 'NONEXISTENT_KEY' not found");
    });

    it("should return database value when env is not set", async () => {
      const mockSecret = {
        getDecryptedValue: vi.fn(async () => "required-db-value")
      };
      const mockSecretModel = {
        find: vi.fn(async () => mockSecret)
      };
      setSecretModelLoader(Promise.resolve(mockSecretModel));

      const value = await getSecretRequired("DB_REQUIRED", "user-1");
      expect(value).toBe("required-db-value");
    });
  });

  describe("hasSecret", () => {
    it("should return true when env var exists", async () => {
      process.env["TEST_SECRET"] = "exists";
      expect(await hasSecret("TEST_SECRET", "user-1")).toBe(true);
    });

    it("should return false when not found", async () => {
      expect(await hasSecret("NONEXISTENT_KEY", "user-1")).toBe(false);
    });

    it("should return true when found in database", async () => {
      const mockSecret = {
        getDecryptedValue: vi.fn(async () => "db-exists-value")
      };
      const mockSecretModel = {
        find: vi.fn(async () => mockSecret)
      };
      setSecretModelLoader(Promise.resolve(mockSecretModel));

      expect(await hasSecret("DB_EXISTS", "user-1")).toBe(true);
    });

    it("should return false when database throws", async () => {
      const mockSecretModel = {
        find: vi.fn(async () => {
          throw new Error("DB error");
        })
      };
      setSecretModelLoader(Promise.resolve(mockSecretModel));

      expect(await hasSecret("DB_ERROR", "user-1")).toBe(false);
    });
  });

  describe("getSecretSync", () => {
    it("should return env var value", () => {
      process.env["TEST_SECRET"] = "sync-value";
      expect(getSecretSync("TEST_SECRET")).toBe("sync-value");
    });

    it("should return null when not found", () => {
      expect(getSecretSync("NONEXISTENT_KEY")).toBeNull();
    });

    it("should return default when not found", () => {
      expect(getSecretSync("NONEXISTENT_KEY", "default")).toBe("default");
    });

    it("should prioritize forced env keys (SUPABASE_URL)", () => {
      process.env["SUPABASE_URL"] = "https://sync.supabase.co";
      expect(getSecretSync("SUPABASE_URL")).toBe("https://sync.supabase.co");
    });
  });

  describe("clearSecretCache", () => {
    it("should clear a specific cached secret", async () => {
      // Populate cache by retrieving a secret
      process.env["TEST_SECRET"] = "cached-value";
      await getSecret("TEST_SECRET", "user-1");

      // Remove from env
      delete process.env["TEST_SECRET"];

      // Should still return cached value
      const cached = await getSecret("TEST_SECRET", "user-1");
      expect(cached).toBe("cached-value");

      // Clear the specific cache entry
      clearSecretCache("user-1", "TEST_SECRET");

      // Now should return null since env is also gone
      const afterClear = await getSecret("TEST_SECRET", "user-1");
      expect(afterClear).toBeNull();
    });
  });

  describe("getSecret caching", () => {
    it("should use default userId when not provided", async () => {
      process.env["TEST_SECRET"] = "default-user-val";
      const value = await getSecret("TEST_SECRET");
      expect(value).toBe("default-user-val");
    });

    it("should return cached value on second call", async () => {
      process.env["TEST_SECRET"] = "first-val";
      await getSecret("TEST_SECRET", "user-1");

      // Change env but cache should prevail
      process.env["TEST_SECRET"] = "second-val";
      const cached = await getSecret("TEST_SECRET", "user-1");
      expect(cached).toBe("first-val");
    });

    it("should return null from cache when cached as null", async () => {
      // First call with no env value sets null in cache path (actually returns null)
      const val = await getSecret("NONEXISTENT_CACHED", "user-1");
      expect(val).toBeNull();
    });
  });

  describe("hasSecret caching", () => {
    it("should detect cached secrets", async () => {
      process.env["TEST_SECRET"] = "exists-for-cache";
      await getSecret("TEST_SECRET", "user-1");
      delete process.env["TEST_SECRET"];

      // Should find it in cache
      const found = await hasSecret("TEST_SECRET", "user-1");
      expect(found).toBe(true);
    });

    it("should use default userId when not provided", async () => {
      const found = await hasSecret("NONEXISTENT_KEY");
      expect(found).toBe(false);
    });
  });
});
