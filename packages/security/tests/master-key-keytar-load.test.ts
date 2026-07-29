/**
 * Tests for loadKeytar() — the lazy dynamic-import path.
 *
 * Most tests inject a fake keytar via setKeytarLoader and never exercise the
 * real `await import("keytar")` branch. Here we mock the "keytar" module itself
 * (success case) so initMasterKey is forced through loadKeytar(): resolving the
 * default export and threading the loaded backend into key resolution.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const keytar = vi.hoisted(() => ({
  getPassword: vi.fn(async () => "key-from-loaded-keytar"),
  setPassword: vi.fn(async () => undefined),
  deletePassword: vi.fn(async () => true)
}));

// Mock the native module so loadKeytar()'s `await import("keytar")` resolves to
// a controllable double exposed under `default` (matching keytar's CJS shape).
vi.mock("keytar", () => ({ default: keytar }));

import {
  initMasterKey,
  setMasterKeyPersistent,
  deleteMasterKey,
  setKeytarLoader,
  clearMasterKeyCache,
  resetKeytarLoader
} from "../src/master-key.js";

describe("loadKeytar — dynamic import success path", () => {
  beforeEach(() => {
    clearMasterKeyCache();
    resetKeytarLoader();
    keytar.getPassword.mockClear();
    delete process.env["SECRETS_MASTER_KEY"];
  });

  afterEach(() => {
    clearMasterKeyCache();
    resetKeytarLoader();
  });

  it("resolves the master key through the dynamically imported keytar", async () => {
    // No setKeytarLoader call → the only way to reach keytar is loadKeytar(),
    // which must unwrap the `default` export and call getPassword on it.
    const key = await initMasterKey();

    expect(key).toBe("key-from-loaded-keytar");
    expect(keytar.getPassword).toHaveBeenCalledWith(
      "nodetool",
      "secrets_master_key"
    );
  });

  it("caches the imported module across resolutions", async () => {
    await initMasterKey();
    clearMasterKeyCache();
    keytar.getPassword.mockClear();

    await initMasterKey();

    // Re-importing keytar would still work, but the cached backend must be the
    // same double — proven by it still serving the stored key on the 2nd call.
    expect(keytar.getPassword).toHaveBeenCalledTimes(1);
  });

  it("setMasterKeyPersistent writes through the dynamically imported keytar", async () => {
    // No injected loader → must lazily load keytar (the `_keytar ?? loadKeytar`
    // fallback), not no-op on a null loader.
    await setMasterKeyPersistent("persisted-via-import");

    expect(keytar.setPassword).toHaveBeenCalledWith(
      "nodetool",
      "secrets_master_key",
      "persisted-via-import"
    );
  });

  it("deleteMasterKey deletes through the dynamically imported keytar", async () => {
    const deleted = await deleteMasterKey();

    expect(deleted).toBe(true);
    expect(keytar.deletePassword).toHaveBeenCalledWith(
      "nodetool",
      "secrets_master_key"
    );
  });

  it("resetKeytarLoader clears an injected loader so the imported keytar is used again", async () => {
    // Inject a distinct loader, then reset it. If reset were a no-op, the
    // injected double below would serve the key; instead the dynamically
    // imported keytar must take over.
    setKeytarLoader({
      getPassword: vi.fn(async () => "key-from-injected-loader"),
      setPassword: vi.fn(async () => undefined),
      deletePassword: vi.fn(async () => true)
    });
    resetKeytarLoader();
    clearMasterKeyCache();

    const key = await initMasterKey();

    expect(key).toBe("key-from-loaded-keytar");
  });
});
