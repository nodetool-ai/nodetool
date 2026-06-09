/**
 * Tests for loadKeytar() when the native module fails to import — the headless
 * deployment scenario (Docker, CI, Linux servers without libsecret).
 *
 * A failed `import("keytar")` must surface as a KeychainAccessError naming the
 * backend-load failure, NOT fall through to some other state. This is the error
 * operators hit when no SECRETS_MASTER_KEY / AWS source is configured on a box
 * without a keychain, so the message must point at the real cause.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("keytar", () => {
  throw new Error("native module missing");
});

import {
  initMasterKey,
  KeychainAccessError,
  clearMasterKeyCache,
  resetKeytarLoader
} from "../src/master-key.js";

describe("loadKeytar — dynamic import failure path", () => {
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

  it("raises a KeychainAccessError naming the backend-load failure", async () => {
    const error = await initMasterKey().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KeychainAccessError);
    expect((error as Error).name).toBe("KeychainAccessError");
    // The wrapped message names the failing operation and the remediation hint.
    // (The underlying cause string is supplied by the import machinery, so we
    // assert the stable prefix/suffix the production code controls.)
    expect((error as Error).message).toContain(
      "Unable to load system keychain backend:"
    );
    expect((error as Error).message).toContain(
      "Allow NodeTool access to the system keychain when prompted."
    );
  });
});
