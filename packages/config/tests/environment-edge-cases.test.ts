/**
 * Edge-case tests for environment module.
 *
 * Covers: requireEnv with empty string, getEnv before/after loading,
 * resetEnvironment, multiple loadEnvironment calls, and missing root directory.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadEnvironment,
  getEnv,
  requireEnv,
  resetEnvironment
} from "../src/environment.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("environment edge cases", () => {
  let tmpDir: string;

  beforeEach(() => {
    resetEnvironment();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-edge-test-"));
  });

  afterEach(() => {
    resetEnvironment();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("requireEnv", () => {
    it("throws for empty string env var", () => {
      process.env["EMPTY_VAR"] = "";
      try {
        expect(() => requireEnv("EMPTY_VAR")).toThrow(
          "Required environment variable EMPTY_VAR is not set"
        );
      } finally {
        delete process.env["EMPTY_VAR"];
      }
    });

    it("throws for completely missing env var", () => {
      delete process.env["TOTALLY_MISSING"];
      expect(() => requireEnv("TOTALLY_MISSING")).toThrow(
        "Required environment variable TOTALLY_MISSING is not set"
      );
    });

    it("returns value when env var is set and non-empty", () => {
      process.env["HAS_VALUE"] = "present";
      try {
        expect(requireEnv("HAS_VALUE")).toBe("present");
      } finally {
        delete process.env["HAS_VALUE"];
      }
    });
  });

  describe("getEnv before loadEnvironment", () => {
    it("falls back to process.env when not loaded", () => {
      process.env["UNLOADED_KEY"] = "direct-env";
      try {
        expect(getEnv("UNLOADED_KEY")).toBe("direct-env");
      } finally {
        delete process.env["UNLOADED_KEY"];
      }
    });

    it("returns defaultValue when env var not set and not loaded", () => {
      delete process.env["MISSING_KEY"];
      expect(getEnv("MISSING_KEY", "fallback")).toBe("fallback");
    });

    it("returns undefined when no default and not set", () => {
      delete process.env["MISSING_KEY"];
      expect(getEnv("MISSING_KEY")).toBeUndefined();
    });
  });

  describe("resetEnvironment", () => {
    it("resets loaded state so getEnv uses process.env again", () => {
      // Create a .env file
      fs.writeFileSync(path.join(tmpDir, ".env"), "FROM_FILE=file_value\n");
      loadEnvironment(tmpDir);
      expect(getEnv("FROM_FILE")).toBe("file_value");

      resetEnvironment();
      // After reset, should fall back to process.env (which doesn't have FROM_FILE)
      // Note: dotenv may have set it on process.env, so clean it
      delete process.env["FROM_FILE"];
      expect(getEnv("FROM_FILE")).toBeUndefined();
    });
  });

  describe("loadEnvironment with empty directory", () => {
    it("does not throw when no .env files exist", () => {
      expect(() => loadEnvironment(tmpDir)).not.toThrow();
    });

    it("getEnv returns undefined for keys not in env after loading empty dir", () => {
      loadEnvironment(tmpDir);
      expect(getEnv("NONEXISTENT_KEY_12345")).toBeUndefined();
    });
  });

  describe("multiple loadEnvironment calls", () => {
    it("second call clears state from first call", () => {
      // First load
      fs.writeFileSync(path.join(tmpDir, ".env"), "KEY_A=alpha\n");
      loadEnvironment(tmpDir);
      expect(getEnv("KEY_A")).toBe("alpha");

      // Second load from different dir (no .env file)
      const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "env-edge2-"));
      try {
        loadEnvironment(tmpDir2);
        // KEY_A was from .env file only, not process.env
        // After loading new dir, envStore is cleared and repopulated
        // If KEY_A is still in process.env (dotenv set it), it will be found via system env
        // Clean it to test
        delete process.env["KEY_A"];
        loadEnvironment(tmpDir2);
        expect(getEnv("KEY_A")).toBeUndefined();
      } finally {
        fs.rmSync(tmpDir2, { recursive: true, force: true });
      }
    });
  });

  describe("system env override", () => {
    it("system env vars take precedence over .env file values", () => {
      fs.writeFileSync(path.join(tmpDir, ".env"), "OVERRIDE_TEST=file_value\n");
      process.env["OVERRIDE_TEST"] = "system_value";
      try {
        loadEnvironment(tmpDir);
        expect(getEnv("OVERRIDE_TEST")).toBe("system_value");
      } finally {
        delete process.env["OVERRIDE_TEST"];
      }
    });
  });

  describe("getEnv with default after loading", () => {
    it("returns default when key not in loaded env", () => {
      loadEnvironment(tmpDir);
      expect(getEnv("NOT_PRESENT", "my-default")).toBe("my-default");
    });
  });
});
