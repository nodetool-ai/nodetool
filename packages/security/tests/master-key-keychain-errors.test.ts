/**
 * Error-message contract tests for keychain failures.
 *
 * A KeychainAccessError must carry BOTH the specific failing operation ("Unable
 * to read/store master key…") and the actionable remediation hint ("Allow
 * NodeTool access…"). Operators rely on this text to distinguish a locked
 * keychain from other startup failures, so the full message — not just one half
 * of it — is part of the contract.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initMasterKey,
  KeychainAccessError,
  clearMasterKeyCache,
  setKeytarLoader,
  resetKeytarLoader
} from "../src/master-key.js";

describe("keychain access errors", () => {
  beforeEach(() => {
    clearMasterKeyCache();
    resetKeytarLoader();
    delete process.env["SECRETS_MASTER_KEY"];
    delete process.env["AWS_SECRETS_MASTER_KEY_NAME"];
  });

  afterEach(() => {
    clearMasterKeyCache();
    resetKeytarLoader();
  });

  it("wraps a read failure with the operation and the remediation hint", async () => {
    setKeytarLoader({
      getPassword: vi.fn().mockRejectedValue(new Error("Keychain locked")),
      setPassword: vi.fn(async () => undefined),
      deletePassword: vi.fn(async () => true)
    });

    const error = await initMasterKey().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KeychainAccessError);
    expect((error as Error).name).toBe("KeychainAccessError");
    expect((error as Error).message).toBe(
      "Unable to read master key from system keychain: Keychain locked. " +
        "Allow NodeTool access to the system keychain when prompted."
    );
  });

  it("wraps a write failure with the operation and the remediation hint", async () => {
    setKeytarLoader({
      getPassword: vi.fn(async () => null),
      setPassword: vi.fn().mockRejectedValue(new Error("Access denied")),
      deletePassword: vi.fn(async () => true)
    });

    const error = await initMasterKey().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KeychainAccessError);
    expect((error as Error).message).toBe(
      "Unable to store master key in system keychain: Access denied. " +
        "Allow NodeTool access to the system keychain when prompted."
    );
  });
});
