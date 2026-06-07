/**
 * Error-path tests for runStartupChecks.
 *
 * The happy path (key present, optional API-key warnings) is covered elsewhere.
 * These tests drive the two failure branches of the master-key check by mocking
 * initMasterKey: a thrown error and a resolved-but-empty key. Without them, the
 * try/catch and the `if (!key)` guard are never exercised.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const masterKey = vi.hoisted(() => ({ initMasterKey: vi.fn() }));

vi.mock("../src/master-key.js", () => ({
  initMasterKey: masterKey.initMasterKey
}));

import { runStartupChecks } from "../src/startup-checks.js";

describe("runStartupChecks — master key failure branches", () => {
  beforeEach(() => {
    masterKey.initMasterKey.mockReset();
  });

  it("reports an error when master key initialization throws", async () => {
    masterKey.initMasterKey.mockRejectedValueOnce(
      new Error("keychain unavailable")
    );

    const result = await runStartupChecks();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe(
      "Master key initialization failed: keychain unavailable"
    );
  });

  it("includes the raw value when a non-Error is thrown", async () => {
    masterKey.initMasterKey.mockRejectedValueOnce("plain string failure");

    const result = await runStartupChecks();

    expect(result.errors[0]).toBe(
      "Master key initialization failed: plain string failure"
    );
  });

  it("reports an error when master key resolves to an empty value", async () => {
    masterKey.initMasterKey.mockResolvedValueOnce("");

    const result = await runStartupChecks();

    expect(result.errors).toEqual([
      "Master encryption key could not be loaded"
    ]);
  });

  it("reports no master-key error when a key is present", async () => {
    masterKey.initMasterKey.mockResolvedValueOnce("a-valid-key");

    const result = await runStartupChecks();

    expect(result.errors).toEqual([]);
  });
});
