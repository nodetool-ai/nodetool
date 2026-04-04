/**
 * Additional edge-case tests for secret-helper.
 *
 * Covers: forced env priority for all keys, cache isolation between users,
 * getSecretSync for non-forced keys, hasSecret with cached null,
 * clearSecretCache for non-existent keys, and DB decryption returning null/undefined.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

describe("secret-helper edge cases", () => {
  const envKeys = [
    "TEST_SECRET",
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SERVER_AUTH_TOKEN",
    "SOME_REGULAR_KEY"
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearAllSecretCache();
    resetSecretModelLoader();
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    clearAllSecretCache();
    resetSecretModelLoader();
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  describe("forced env priority keys", () => {
    it("SUPABASE_KEY is force-prioritized over database", async () => {
      process.env["SUPABASE_KEY"] = "env-supabase-key";
      const mockSecret = {
        getDecryptedValue: vi.fn(async () => "db-supabase-key")
      };
      const mockModel = {
        find: vi.fn(async () => mockSecret)
      };
      setSecretModelLoader(Promise.resolve(mockModel));

      const value = await getSecret("SUPABASE_KEY", "user-1");
      expect(value).toBe("env-supabase-key");
      // DB should NOT have been queried
      expect(mockModel.find).not.toHaveBeenCalled();
    });

    it("SERVER_AUTH_TOKEN is force-prioritized", async () => {
      process.env["SERVER_AUTH_TOKEN"] = "server-token-val";
      const value = await getSecret("SERVER_AUTH_TOKEN", "user-1");
      expect(value).toBe("server-token-val");
    });

    it("SUPABASE_SERVICE_ROLE_KEY is force-prioritized", async () => {
      process.env["SUPABASE_SERVICE_ROLE_KEY"] = "role-key-val";
      const value = await getSecret("SUPABASE_SERVICE_ROLE_KEY", "user-1");
      expect(value).toBe("role-key-val");
    });

    it("non-forced key goes through normal resolution", async () => {
      process.env["SOME_REGULAR_KEY"] = "env-val";
      const mockSecret = {
        getDecryptedValue: vi.fn(async () => "db-val")
      };
      const mockModel = {
        find: vi.fn(async () => mockSecret)
      };
      setSecretModelLoader(Promise.resolve(mockModel));

      // DB should be checked before env for non-forced keys
      const value = await getSecret("SOME_REGULAR_KEY", "user-1");
      expect(value).toBe("db-val");
      expect(mockModel.find).toHaveBeenCalled();
    });
  });

  describe("cache isolation between users", () => {
    it("different users have separate cache entries", async () => {
      const mockModel = {
        find: vi.fn(async (userId: string, _key: string) => {
          return {
            getDecryptedValue: vi.fn(async () => `secret-for-${userId}`)
          };
        })
      };
      setSecretModelLoader(Promise.resolve(mockModel));

      const val1 = await getSecret("TEST_SECRET", "user-A");
      const val2 = await getSecret("TEST_SECRET", "user-B");

      expect(val1).toBe("secret-for-user-A");
      expect(val2).toBe("secret-for-user-B");
    });

    it("clearing cache for one user does not affect another", async () => {
      const mockModel = {
        find: vi.fn(async (userId: string) => ({
          getDecryptedValue: vi.fn(async () => `val-${userId}`)
        }))
      };
      setSecretModelLoader(Promise.resolve(mockModel));

      await getSecret("TEST_SECRET", "user-A");
      await getSecret("TEST_SECRET", "user-B");

      clearSecretCache("user-A", "TEST_SECRET");

      // user-B should still be cached
      // reset model so DB call would return something different
      setSecretModelLoader(Promise.resolve(null));
      const valB = await getSecret("TEST_SECRET", "user-B");
      expect(valB).toBe("val-user-B");
    });
  });

  describe("getSecretSync edge cases", () => {
    it("returns env value for non-forced key", () => {
      process.env["SOME_REGULAR_KEY"] = "sync-regular";
      expect(getSecretSync("SOME_REGULAR_KEY")).toBe("sync-regular");
    });

    it("returns null for unset non-forced key without default", () => {
      expect(getSecretSync("SOME_REGULAR_KEY")).toBeNull();
    });

    it("returns default for unset key", () => {
      expect(getSecretSync("SOME_REGULAR_KEY", "fallback")).toBe("fallback");
    });

    it("env value takes precedence over default", () => {
      process.env["SOME_REGULAR_KEY"] = "env-wins";
      expect(getSecretSync("SOME_REGULAR_KEY", "fallback")).toBe("env-wins");
    });
  });

  describe("hasSecret edge cases", () => {
    it("returns true from cache even when env was removed", async () => {
      const mockModel = {
        find: vi.fn(async () => ({
          getDecryptedValue: vi.fn(async () => "db-value")
        }))
      };
      setSecretModelLoader(Promise.resolve(mockModel));

      // hasSecret should find it in DB and cache it
      const found = await hasSecret("TEST_SECRET", "user-1");
      expect(found).toBe(true);

      // Now remove DB model
      setSecretModelLoader(Promise.resolve(null));

      // Should still find in cache
      const foundAgain = await hasSecret("TEST_SECRET", "user-1");
      expect(foundAgain).toBe(true);
    });

    it("returns false when DB returns null", async () => {
      const mockModel = { find: vi.fn(async () => null) };
      setSecretModelLoader(Promise.resolve(mockModel));

      const found = await hasSecret("TEST_SECRET", "user-1");
      expect(found).toBe(false);
    });
  });

  describe("getSecretRequired edge cases", () => {
    it("throws with descriptive message including key name", async () => {
      await expect(getSecretRequired("MY_MISSING_KEY")).rejects.toThrow(
        "Required secret 'MY_MISSING_KEY' not found"
      );
    });

    it("succeeds when DB has the value", async () => {
      const mockModel = {
        find: vi.fn(async () => ({
          getDecryptedValue: vi.fn(async () => "required-db-value")
        }))
      };
      setSecretModelLoader(Promise.resolve(mockModel));

      const val = await getSecretRequired("TEST_SECRET", "user-1");
      expect(val).toBe("required-db-value");
    });
  });

  describe("DB decryption returning null/undefined", () => {
    it("falls through when getDecryptedValue returns null", async () => {
      const mockModel = {
        find: vi.fn(async () => ({
          getDecryptedValue: vi.fn(async () => null)
        }))
      };
      setSecretModelLoader(Promise.resolve(mockModel));

      process.env["TEST_SECRET"] = "env-fallback";
      const value = await getSecret("TEST_SECRET", "user-1");
      expect(value).toBe("env-fallback");
    });

    it("falls through when getDecryptedValue returns undefined", async () => {
      const mockModel = {
        find: vi.fn(async () => ({
          getDecryptedValue: vi.fn(async () => undefined)
        }))
      };
      setSecretModelLoader(Promise.resolve(mockModel));

      const value = await getSecret("TEST_SECRET", "user-1", "my-default");
      expect(value).toBe("my-default");
    });
  });

  describe("clearAllSecretCache", () => {
    it("removes all cached entries across users", async () => {
      process.env["TEST_SECRET"] = "cached";
      await getSecret("TEST_SECRET", "user-A");
      await getSecret("TEST_SECRET", "user-B");
      delete process.env["TEST_SECRET"];

      clearAllSecretCache();

      const valA = await getSecret("TEST_SECRET", "user-A");
      const valB = await getSecret("TEST_SECRET", "user-B");
      expect(valA).toBeNull();
      expect(valB).toBeNull();
    });
  });

  describe("clearSecretCache for non-existent key", () => {
    it("does not throw when clearing a key that was never cached", () => {
      expect(() => clearSecretCache("user-1", "NEVER_SET")).not.toThrow();
    });
  });
});
