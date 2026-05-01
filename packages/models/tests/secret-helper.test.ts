import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setMasterKey } from "@nodetool-ai/security";
import { initTestDb } from "../src/db.js";
import { Secret } from "../src/secret.js";
import {
  getSecret,
  getSecretRequired,
  hasSecret,
  getSecretSync,
  clearSecretCache,
  clearAllSecretCache
} from "../src/secret-helper.js";

const TEST_MASTER_KEY = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz";

function setup() {
  initTestDb();
  setMasterKey(TEST_MASTER_KEY);
  clearAllSecretCache();
}

describe("secret-helper", () => {
  beforeEach(setup);
  afterEach(() => {
    delete process.env.TEST_ENV_SECRET;
    delete process.env.SUPABASE_URL;
    clearAllSecretCache();
  });

  describe("getSecret", () => {
    it("returns env value when DB has no row", async () => {
      process.env.TEST_ENV_SECRET = "from-env";
      expect(await getSecret("TEST_ENV_SECRET", "user-1")).toBe("from-env");
    });

    it("returns default when neither DB nor env has it", async () => {
      expect(await getSecret("MISSING_KEY", "user-1", "fallback")).toBe(
        "fallback"
      );
    });

    it("returns null when absent everywhere", async () => {
      expect(await getSecret("MISSING_KEY", "user-1")).toBeNull();
    });

    it("reads from DB when row exists for userId", async () => {
      await Secret.upsert({
        userId: "user-1",
        key: "DB_KEY",
        value: "db-value"
      });
      expect(await getSecret("DB_KEY", "user-1")).toBe("db-value");
    });

    it("DB row takes precedence over env var", async () => {
      process.env.DB_KEY = "env-wins-not";
      await Secret.upsert({
        userId: "user-1",
        key: "DB_KEY",
        value: "db-wins"
      });
      expect(await getSecret("DB_KEY", "user-1")).toBe("db-wins");
      delete process.env.DB_KEY;
    });

    it("caches DB lookups", async () => {
      await Secret.upsert({
        userId: "user-1",
        key: "CACHED",
        value: "v1"
      });
      expect(await getSecret("CACHED", "user-1")).toBe("v1");
      await Secret.deleteSecret("user-1", "CACHED");
      // still cached
      expect(await getSecret("CACHED", "user-1")).toBe("v1");
      clearSecretCache("user-1", "CACHED");
      expect(await getSecret("CACHED", "user-1")).toBeNull();
    });

    it("forces env priority for Supabase keys", async () => {
      process.env.SUPABASE_URL = "https://env.supabase.co";
      await Secret.upsert({
        userId: "user-1",
        key: "SUPABASE_URL",
        value: "https://db.supabase.co"
      });
      expect(await getSecret("SUPABASE_URL", "user-1")).toBe(
        "https://env.supabase.co"
      );
    });

    it("skips DB lookup when userId is not provided", async () => {
      await Secret.upsert({
        userId: "user-1",
        key: "DB_ONLY",
        value: "db-value"
      });
      expect(await getSecret("DB_ONLY")).toBeNull();
    });
  });

  describe("getSecretRequired", () => {
    it("returns value when found", async () => {
      process.env.REQ_KEY = "present";
      expect(await getSecretRequired("REQ_KEY", "user-1")).toBe("present");
      delete process.env.REQ_KEY;
    });

    it("throws when missing", async () => {
      await expect(getSecretRequired("NOPE", "user-1")).rejects.toThrow(
        /Required secret 'NOPE'/
      );
    });
  });

  describe("hasSecret", () => {
    it("returns true for env value", async () => {
      process.env.HAS_ENV = "x";
      expect(await hasSecret("HAS_ENV", "user-1")).toBe(true);
      delete process.env.HAS_ENV;
    });

    it("returns true for DB value", async () => {
      await Secret.upsert({
        userId: "user-1",
        key: "HAS_DB",
        value: "x"
      });
      expect(await hasSecret("HAS_DB", "user-1")).toBe(true);
    });

    it("returns false when absent", async () => {
      expect(await hasSecret("NOPE", "user-1")).toBe(false);
    });
  });

  describe("getSecretSync", () => {
    it("reads env only", () => {
      process.env.SYNC_KEY = "sync-val";
      expect(getSecretSync("SYNC_KEY")).toBe("sync-val");
      delete process.env.SYNC_KEY;
    });

    it("returns default when env missing", () => {
      expect(getSecretSync("MISSING", "d")).toBe("d");
      expect(getSecretSync("MISSING")).toBeNull();
    });
  });
});
