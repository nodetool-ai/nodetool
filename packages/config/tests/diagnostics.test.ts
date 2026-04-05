/**
 * Tests for T-CFG-4: Environment diagnostics.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  diagnoseEnvironment,
  maskSecret,
  registerSetting,
  clearSettings,
  getSettings
} from "../src/index.js";

describe("T-CFG-4: maskSecret", () => {
  it("masks short values (<=8 chars) entirely", () => {
    expect(maskSecret("abc")).toBe("***");
    expect(maskSecret("12345678")).toBe("***");
  });

  it("shows first 4 and last 4 chars for longer values", () => {
    expect(maskSecret("sk-proj_abcdef_key")).toBe("sk-p***_key");
    expect(maskSecret("123456789")).toBe("1234***6789");
  });

  it("handles exactly 9 chars", () => {
    expect(maskSecret("abcdefghi")).toBe("abcd***fghi");
  });
});

describe("T-CFG-4: diagnoseEnvironment", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearSettings();
    saved.MY_API_KEY = process.env.MY_API_KEY;
    saved.MY_CONFIG = process.env.MY_CONFIG;
    saved.MY_UNSET = process.env.MY_UNSET;
  });

  afterEach(() => {
    clearSettings();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("reports unset settings with isSet=false and null maskedValue", () => {
    registerSetting({
      package: "test",
      envVar: "MY_UNSET",
      group: "Test",
      description: "An unset variable",
      isSecret: false
    });
    delete process.env.MY_UNSET;

    const results = diagnoseEnvironment();
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      key: "MY_UNSET",
      group: "Test",
      isSet: false,
      isSecret: false,
      maskedValue: null,
      description: "An unset variable"
    });
  });

  it("shows full value for non-secret settings", () => {
    registerSetting({
      package: "test",
      envVar: "MY_CONFIG",
      group: "Test",
      description: "A config value",
      isSecret: false
    });
    process.env.MY_CONFIG = "hello-world";

    const results = diagnoseEnvironment();
    expect(results).toHaveLength(1);
    expect(results[0].isSet).toBe(true);
    expect(results[0].maskedValue).toBe("hello-world");
  });

  it("masks secret values", () => {
    registerSetting({
      package: "test",
      envVar: "MY_API_KEY",
      group: "Test",
      description: "A secret key",
      isSecret: true
    });
    process.env.MY_API_KEY = "sk-proj_abcdef_key";

    const results = diagnoseEnvironment();
    expect(results).toHaveLength(1);
    expect(results[0].isSet).toBe(true);
    expect(results[0].isSecret).toBe(true);
    expect(results[0].maskedValue).toBe("sk-p***_key");
  });

  it("masks short secret values entirely", () => {
    registerSetting({
      package: "test",
      envVar: "MY_API_KEY",
      group: "Test",
      description: "Short secret",
      isSecret: true
    });
    process.env.MY_API_KEY = "abc";

    const results = diagnoseEnvironment();
    expect(results[0].maskedValue).toBe("***");
  });

  it("handles multiple settings", () => {
    registerSetting({
      package: "test",
      envVar: "MY_CONFIG",
      group: "Config",
      description: "Config",
      isSecret: false
    });
    registerSetting({
      package: "test",
      envVar: "MY_API_KEY",
      group: "Secrets",
      description: "Secret",
      isSecret: true
    });
    process.env.MY_CONFIG = "value1";
    process.env.MY_API_KEY = "super-secret-key-value";

    const results = diagnoseEnvironment();
    expect(results).toHaveLength(2);
    expect(results[0].maskedValue).toBe("value1");
    expect(results[1].maskedValue).toBe("supe***alue");
  });

  it("accepts custom settings array", () => {
    const custom = [
      {
        package: "custom",
        envVar: "MY_CONFIG",
        group: "G",
        description: "D",
        isSecret: false,
        configured: true
      }
    ];
    process.env.MY_CONFIG = "val";

    const results = diagnoseEnvironment(custom);
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("MY_CONFIG");
  });
});
