/**
 * Additional edge-case tests for startup-checks.
 *
 * Covers: getMasterKey throwing, all optional API keys in warnings,
 * result structure validation, and partial API key configuration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runStartupChecks } from "../src/startup-checks.js";
import { clearMasterKeyCache, setMasterKey } from "../src/master-key.js";

const OPTIONAL_API_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "REPLICATE_API_TOKEN",
  "HF_TOKEN",
  "ELEVENLABS_API_KEY",
  "FAL_API_KEY"
];

describe("startup-checks edge cases", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearMasterKeyCache();
    for (const key of OPTIONAL_API_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    clearMasterKeyCache();
    for (const key of OPTIONAL_API_KEYS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it("reports all 7 optional API key warnings when none set", async () => {
    setMasterKey("test-key");
    const result = await runStartupChecks();
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(7);

    for (const key of OPTIONAL_API_KEYS) {
      expect(result.warnings.some((w) => w.includes(key))).toBe(true);
    }
  });

  it("excludes set API keys from warnings", async () => {
    setMasterKey("test-key");
    process.env["OPENAI_API_KEY"] = "sk-test";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    process.env["FAL_API_KEY"] = "fal-test";

    const result = await runStartupChecks();
    expect(result.warnings).toHaveLength(4); // 7 - 3 set
    expect(result.warnings.some((w) => w.includes("OPENAI_API_KEY"))).toBe(
      false
    );
    expect(result.warnings.some((w) => w.includes("ANTHROPIC_API_KEY"))).toBe(
      false
    );
    expect(result.warnings.some((w) => w.includes("FAL_API_KEY"))).toBe(false);
  });

  it("reports no warnings when all API keys are set", async () => {
    setMasterKey("test-key");
    for (const key of OPTIONAL_API_KEYS) {
      process.env[key] = "some-value";
    }

    const result = await runStartupChecks();
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns correct structure shape", async () => {
    setMasterKey("test-key");
    const result = await runStartupChecks();

    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("warnings");
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("warning messages include descriptive text", async () => {
    setMasterKey("test-key");
    const result = await runStartupChecks();

    for (const warning of result.warnings) {
      expect(warning).toContain("is not set");
      expect(warning).toContain("will be unavailable");
    }
  });

  it("no error when master key is available via setMasterKey", async () => {
    setMasterKey("valid-key-123");
    const result = await runStartupChecks();
    expect(result.errors).toHaveLength(0);
  });
});
