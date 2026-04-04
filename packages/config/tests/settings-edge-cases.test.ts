/**
 * Edge-case tests for settings registry and diagnostics.
 *
 * Covers: empty string env var treated as unconfigured, overwriting settings,
 * clearSettings isolation, diagnostics with empty env values, and maskSecret edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  registerSetting,
  getSettings,
  clearSettings,
  type SettingDefinition
} from "../src/settings.js";
import { maskSecret, diagnoseEnvironment } from "../src/diagnostics.js";

describe("settings edge cases", () => {
  beforeEach(() => {
    clearSettings();
  });

  afterEach(() => {
    clearSettings();
  });

  it("empty string env var is treated as unconfigured", () => {
    process.env["EMPTY_SETTING"] = "";
    try {
      registerSetting({
        package: "test",
        envVar: "EMPTY_SETTING",
        group: "test",
        description: "Test setting",
        isSecret: false
      });
      const settings = getSettings();
      expect(settings[0].configured).toBe(false);
    } finally {
      delete process.env["EMPTY_SETTING"];
    }
  });

  it("setting with non-empty env var is configured", () => {
    process.env["GOOD_SETTING"] = "value";
    try {
      registerSetting({
        package: "test",
        envVar: "GOOD_SETTING",
        group: "test",
        description: "Has value",
        isSecret: false
      });
      const settings = getSettings();
      expect(settings[0].configured).toBe(true);
    } finally {
      delete process.env["GOOD_SETTING"];
    }
  });

  it("overwriting a setting with same envVar replaces it", () => {
    registerSetting({
      package: "test",
      envVar: "MY_KEY",
      group: "group1",
      description: "Original",
      isSecret: false
    });
    registerSetting({
      package: "test",
      envVar: "MY_KEY",
      group: "group2",
      description: "Replaced",
      isSecret: true
    });

    const settings = getSettings();
    expect(settings).toHaveLength(1);
    expect(settings[0].description).toBe("Replaced");
    expect(settings[0].isSecret).toBe(true);
  });

  it("clearSettings removes all registered settings", () => {
    registerSetting({
      package: "test",
      envVar: "A",
      group: "g",
      description: "d",
      isSecret: false
    });
    registerSetting({
      package: "test",
      envVar: "B",
      group: "g",
      description: "d",
      isSecret: false
    });
    clearSettings();
    expect(getSettings()).toHaveLength(0);
  });

  it("getSettings returns fresh configured status each call", () => {
    registerSetting({
      package: "test",
      envVar: "DYNAMIC_KEY",
      group: "g",
      description: "d",
      isSecret: false
    });

    delete process.env["DYNAMIC_KEY"];
    expect(getSettings()[0].configured).toBe(false);

    process.env["DYNAMIC_KEY"] = "now-set";
    expect(getSettings()[0].configured).toBe(true);

    delete process.env["DYNAMIC_KEY"];
  });

  it("handles many settings", () => {
    for (let i = 0; i < 100; i++) {
      registerSetting({
        package: "test",
        envVar: `SETTING_${i}`,
        group: "bulk",
        description: `Setting ${i}`,
        isSecret: i % 2 === 0
      });
    }
    expect(getSettings()).toHaveLength(100);
  });
});

describe("diagnostics edge cases", () => {
  beforeEach(() => {
    clearSettings();
  });

  afterEach(() => {
    clearSettings();
  });

  describe("maskSecret", () => {
    it("masks exactly 8 char value entirely", () => {
      expect(maskSecret("12345678")).toBe("***");
    });

    it("masks 1 char value entirely", () => {
      expect(maskSecret("x")).toBe("***");
    });

    it("shows first 4 and last 4 for 9 char value", () => {
      const result = maskSecret("123456789");
      expect(result).toBe("1234***6789");
    });

    it("handles very long values", () => {
      const long = "a".repeat(100);
      const result = maskSecret(long);
      expect(result).toBe("aaaa***aaaa");
    });

    it("handles values with special characters", () => {
      const result = maskSecret("sk-abc123xyz!@#$");
      expect(result).toBe("sk-a***!@#$");
    });
  });

  describe("diagnoseEnvironment", () => {
    it("returns empty array when no settings registered", () => {
      const results = diagnoseEnvironment();
      expect(results).toHaveLength(0);
    });

    it("uses registered settings when no override provided", () => {
      registerSetting({
        package: "test",
        envVar: "DIAG_KEY",
        group: "test",
        description: "Diagnostic key",
        isSecret: false
      });
      process.env["DIAG_KEY"] = "visible-value";
      try {
        const results = diagnoseEnvironment();
        expect(results).toHaveLength(1);
        expect(results[0].key).toBe("DIAG_KEY");
        expect(results[0].isSet).toBe(true);
        expect(results[0].maskedValue).toBe("visible-value");
      } finally {
        delete process.env["DIAG_KEY"];
      }
    });

    it("masks secret values in diagnostics", () => {
      registerSetting({
        package: "test",
        envVar: "SECRET_DIAG",
        group: "test",
        description: "Secret",
        isSecret: true
      });
      process.env["SECRET_DIAG"] = "super-secret-api-key-12345";
      try {
        const results = diagnoseEnvironment();
        expect(results[0].maskedValue).toBe("supe***2345");
        expect(results[0].isSecret).toBe(true);
      } finally {
        delete process.env["SECRET_DIAG"];
      }
    });

    it("returns null maskedValue for unset settings", () => {
      registerSetting({
        package: "test",
        envVar: "UNSET_DIAG",
        group: "test",
        description: "Unset",
        isSecret: false
      });
      delete process.env["UNSET_DIAG"];
      const results = diagnoseEnvironment();
      expect(results[0].isSet).toBe(false);
      expect(results[0].maskedValue).toBeNull();
    });

    it("accepts custom settings array", () => {
      const custom = [
        {
          package: "custom",
          envVar: "CUSTOM_KEY",
          group: "custom",
          description: "Custom",
          isSecret: false,
          configured: true
        }
      ];
      process.env["CUSTOM_KEY"] = "custom-val";
      try {
        const results = diagnoseEnvironment(custom);
        expect(results).toHaveLength(1);
        expect(results[0].maskedValue).toBe("custom-val");
      } finally {
        delete process.env["CUSTOM_KEY"];
      }
    });
  });
});
