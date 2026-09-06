/**
 * Tests for T-CFG-1 (environment loader).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadEnvironment,
  getEnv,
  requireEnv,
  resetEnvironment
} from "../src/index.js";

// ── T-CFG-1 — Environment loader ────────────────────────────────────

describe("T-CFG-1: Environment loader", () => {
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cfg-test-"));
    resetEnvironment();
    // Save NODE_ENV
    savedEnv.NODE_ENV = process.env.NODE_ENV;
    savedEnv.TEST_CFG_VAR = process.env.TEST_CFG_VAR;
    savedEnv.TEST_OVERRIDE = process.env.TEST_OVERRIDE;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    resetEnvironment();
    // Restore
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  it("loads .env file", async () => {
    await fs.writeFile(path.join(tmpDir, ".env"), "TEST_CFG_VAR=from_dotenv\n");
    delete process.env.TEST_CFG_VAR;
    loadEnvironment(tmpDir);
    expect(getEnv("TEST_CFG_VAR")).toBe("from_dotenv");
  });

  it("NODE_ENV=test loads .env.test", async () => {
    await fs.writeFile(path.join(tmpDir, ".env"), "TEST_CFG_VAR=base\n");
    await fs.writeFile(
      path.join(tmpDir, ".env.test"),
      "TEST_CFG_VAR=from_test\n"
    );
    process.env.NODE_ENV = "test";
    delete process.env.TEST_CFG_VAR;
    loadEnvironment(tmpDir);
    expect(getEnv("TEST_CFG_VAR")).toBe("from_test");
  });

  it(".local overrides .env.{NODE_ENV}", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".env.test"),
      "TEST_CFG_VAR=from_test\n"
    );
    await fs.writeFile(
      path.join(tmpDir, ".env.test.local"),
      "TEST_CFG_VAR=from_local\n"
    );
    process.env.NODE_ENV = "test";
    delete process.env.TEST_CFG_VAR;
    loadEnvironment(tmpDir);
    expect(getEnv("TEST_CFG_VAR")).toBe("from_local");
  });

  it("system env overrides all files", async () => {
    await fs.writeFile(path.join(tmpDir, ".env"), "TEST_OVERRIDE=from_file\n");
    process.env.TEST_OVERRIDE = "from_system";
    loadEnvironment(tmpDir);
    expect(getEnv("TEST_OVERRIDE")).toBe("from_system");
  });

  it("getEnv returns default when var not set", () => {
    resetEnvironment();
    delete process.env.NONEXISTENT_VAR_XYZ;
    expect(getEnv("NONEXISTENT_VAR_XYZ", "fallback")).toBe("fallback");
  });

  it("getEnv returns undefined when var not set and no default", () => {
    resetEnvironment();
    delete process.env.NONEXISTENT_VAR_XYZ;
    expect(getEnv("NONEXISTENT_VAR_XYZ")).toBeUndefined();
  });

  it("requireEnv throws when var not set", () => {
    resetEnvironment();
    delete process.env.NONEXISTENT_VAR_XYZ;
    expect(() => requireEnv("NONEXISTENT_VAR_XYZ")).toThrow(
      "NONEXISTENT_VAR_XYZ"
    );
  });

  it("requireEnv returns value when set", async () => {
    await fs.writeFile(path.join(tmpDir, ".env"), "TEST_CFG_VAR=present\n");
    delete process.env.TEST_CFG_VAR;
    loadEnvironment(tmpDir);
    expect(requireEnv("TEST_CFG_VAR")).toBe("present");
  });
});
