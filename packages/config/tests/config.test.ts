/**
 * Tests for T-CFG-1 (environment loader) and T-CFG-2 (settings registry).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadEnvironment,
  getEnv,
  requireEnv,
  resetEnvironment,
  registerSetting,
  getSettings,
  clearSettings,
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
    await fs.writeFile(path.join(tmpDir, ".env.test"), "TEST_CFG_VAR=from_test\n");
    process.env.NODE_ENV = "test";
    delete process.env.TEST_CFG_VAR;
    loadEnvironment(tmpDir);
    expect(getEnv("TEST_CFG_VAR")).toBe("from_test");
  });

  it(".local overrides .env.{NODE_ENV}", async () => {
    await fs.writeFile(path.join(tmpDir, ".env.test"), "TEST_CFG_VAR=from_test\n");
    await fs.writeFile(path.join(tmpDir, ".env.test.local"), "TEST_CFG_VAR=from_local\n");
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
    expect(() => requireEnv("NONEXISTENT_VAR_XYZ")).toThrow("NONEXISTENT_VAR_XYZ");
  });

  it("requireEnv returns value when set", async () => {
    await fs.writeFile(path.join(tmpDir, ".env"), "TEST_CFG_VAR=present\n");
    delete process.env.TEST_CFG_VAR;
    loadEnvironment(tmpDir);
    expect(requireEnv("TEST_CFG_VAR")).toBe("present");
  });
});

// ── T-CFG-2 — Settings registry ─────────────────────────────────────

describe("T-CFG-2: Settings registry", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearSettings();
    savedEnv.MY_TEST_KEY = process.env.MY_TEST_KEY;
    savedEnv.MY_SECRET = process.env.MY_SECRET;
  });

  afterEach(() => {
    clearSettings();
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  it("registerSetting adds to registry", () => {
    registerSetting({
      package: "nodetool",
      envVar: "MY_TEST_KEY",
      group: "TestGroup",
      description: "A test setting",
      isSecret: false,
    });
    const settings = getSettings();
    expect(settings.length).toBe(1);
    expect(settings[0].envVar).toBe("MY_TEST_KEY");
    expect(settings[0].group).toBe("TestGroup");
  });

  it("getSettings marks configured when env var is set", () => {
    registerSetting({
      package: "nodetool",
      envVar: "MY_TEST_KEY",
      group: "Test",
      description: "test",
      isSecret: false,
    });
    process.env.MY_TEST_KEY = "some_value";
    const settings = getSettings();
    expect(settings[0].configured).toBe(true);
  });

  it("getSettings marks unconfigured when env var is not set", () => {
    registerSetting({
      package: "nodetool",
      envVar: "MY_TEST_KEY",
      group: "Test",
      description: "test",
      isSecret: false,
    });
    delete process.env.MY_TEST_KEY;
    const settings = getSettings();
    expect(settings[0].configured).toBe(false);
  });

  it("multiple settings registered correctly", () => {
    registerSetting({
      package: "nodetool",
      envVar: "MY_TEST_KEY",
      group: "Test",
      description: "test key",
      isSecret: false,
    });
    registerSetting({
      package: "nodetool",
      envVar: "MY_SECRET",
      group: "Secrets",
      description: "a secret",
      isSecret: true,
    });
    process.env.MY_TEST_KEY = "v";
    delete process.env.MY_SECRET;
    const settings = getSettings();
    expect(settings.length).toBe(2);
    const keySet = settings.find((s) => s.envVar === "MY_TEST_KEY");
    const secretUnset = settings.find((s) => s.envVar === "MY_SECRET");
    expect(keySet?.configured).toBe(true);
    expect(secretUnset?.configured).toBe(false);
    expect(secretUnset?.isSecret).toBe(true);
  });
});
