/**
 * Tests for the AWS Secrets Manager master-key source.
 *
 * When AWS_SECRETS_MASTER_KEY_NAME is set, AWS is the *authoritative* key
 * source: a transient failure (or an empty secret) must be fatal rather than
 * silently falling through to a freshly generated keychain key, which would
 * orphan every previously-encrypted secret.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoisted so the vi.mock factory below can reference it safely.
const aws = vi.hoisted(() => ({ send: vi.fn(async () => ({}) as unknown) }));

vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send = aws.send;
  },
  GetSecretValueCommand: class {
    constructor(public readonly input: unknown) {}
  }
}));

import {
  initMasterKey,
  clearMasterKeyCache,
  setKeytarLoader,
  resetKeytarLoader
} from "../src/master-key.js";

describe("initMasterKey — AWS Secrets Manager source", () => {
  beforeEach(() => {
    clearMasterKeyCache();
    resetKeytarLoader();
    aws.send.mockReset();
    delete process.env["SECRETS_MASTER_KEY"];
    process.env["AWS_SECRETS_MASTER_KEY_NAME"] = "nodetool/master-key";
  });

  afterEach(() => {
    clearMasterKeyCache();
    resetKeytarLoader();
    delete process.env["AWS_SECRETS_MASTER_KEY_NAME"];
  });

  it("uses the AWS secret string when present", async () => {
    aws.send.mockResolvedValueOnce({ SecretString: "aws-sourced-key" });

    const key = await initMasterKey();
    expect(key).toBe("aws-sourced-key");
  });

  it("decodes a binary AWS secret", async () => {
    aws.send.mockResolvedValueOnce({
      SecretBinary: Buffer.from("aws-binary-key", "utf-8")
    });

    const key = await initMasterKey();
    expect(key).toBe("aws-binary-key");
  });

  it("is fatal on AWS error — never falls back to a generated keychain key", async () => {
    aws.send.mockRejectedValueOnce(new Error("throttled"));
    const setPassword = vi.fn(async () => undefined);
    const getPassword = vi.fn(async () => null);
    setKeytarLoader({
      getPassword,
      setPassword,
      deletePassword: vi.fn(async () => true)
    });

    await expect(initMasterKey()).rejects.toThrow(/AWS Secrets Manager/);
    // The whole point: no keychain fallback, no new key generated/persisted.
    expect(getPassword).not.toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("is fatal when the AWS secret carries no value", async () => {
    aws.send.mockResolvedValueOnce({});
    const setPassword = vi.fn(async () => undefined);
    setKeytarLoader({
      getPassword: vi.fn(async () => null),
      setPassword,
      deletePassword: vi.fn(async () => true)
    });

    await expect(initMasterKey()).rejects.toThrow(/no value/);
    expect(setPassword).not.toHaveBeenCalled();
  });
});
