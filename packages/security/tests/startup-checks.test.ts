/**
 * Tests for T-SEC-8: Startup checks.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runStartupChecks } from "../src/startup-checks.js";
import { clearMasterKeyCache, setMasterKey } from "../src/master-key.js";

describe("T-SEC-8: runStartupChecks", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear relevant env vars
    for (const key of [
      "SECRETS_MASTER_KEY",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY"
    ]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    clearMasterKeyCache();
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    clearMasterKeyCache();
  });

  it("returns no errors when master key is loadable", async () => {
    setMasterKey("dGVzdC1rZXktYmFzZTY0LWVuY29kZWQ=");
    const result = await runStartupChecks();
    expect(result.errors).toEqual([]);
  });

  it("returns warnings when API keys are missing", async () => {
    setMasterKey("dGVzdC1rZXktYmFzZTY0LWVuY29kZWQ=");
    const result = await runStartupChecks();
    expect(result.warnings.length).toBeGreaterThan(0);
    const warningText = result.warnings.join(" ");
    expect(warningText).toContain("OPENAI_API_KEY");
  });

  it("returns no warnings for API keys that are set", async () => {
    setMasterKey("dGVzdC1rZXktYmFzZTY0LWVuY29kZWQ=");
    process.env["OPENAI_API_KEY"] = "sk-test";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    const result = await runStartupChecks();
    const warningText = result.warnings.join(" ");
    expect(warningText).not.toContain("OPENAI_API_KEY");
    expect(warningText).not.toContain("ANTHROPIC_API_KEY");
  });

  it("result has errors and warnings arrays", async () => {
    setMasterKey("dGVzdC1rZXktYmFzZTY0LWVuY29kZWQ=");
    const result = await runStartupChecks();
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
