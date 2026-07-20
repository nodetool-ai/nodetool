import fs from "fs";
import path from "path";
import os from "os";
import * as yaml from "js-yaml";

/**
 * Persistence-focused tests for electron/src/settings.ts.
 *
 * Covers the gaps left by settings.test.ts, settings.channels.test.ts, and
 * settings.updateChannel.test.ts — specifically the file I/O paths, cache
 * behaviour, platform-specific config paths, error handling, edge-case YAML
 * payloads, and validation guards.
 */

let tempDir: string;
const originalPlatform = process.platform;
const originalAppData = process.env.APPDATA;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform });
}

beforeEach(() => {
  jest.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-persist-test-"));
  jest.spyOn(os, "homedir").mockReturnValue(tempDir);
  setPlatform("linux");
  delete process.env.APPDATA;
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  (os.homedir as jest.Mock).mockRestore();
  setPlatform(originalPlatform as NodeJS.Platform);
  if (originalAppData !== undefined) {
    process.env.APPDATA = originalAppData;
  } else {
    delete process.env.APPDATA;
  }
});

// ---------------------------------------------------------------------------
// getAppConfigPath — platform paths & validation
// ---------------------------------------------------------------------------

describe("getAppConfigPath", () => {
  test("creates darwin config path under ~/.config/nodetool", async () => {
    setPlatform("darwin");
    const { getAppConfigPath } = await import("../settings");
    const result = getAppConfigPath("settings.yaml");
    expect(result).toBe(
      path.join(tempDir, ".config", "nodetool", "settings.yaml")
    );
    expect(fs.existsSync(path.dirname(result))).toBe(true);
  });

  test("creates win32 config path under APPDATA when set", async () => {
    setPlatform("win32");
    const appDataDir = path.join(tempDir, "AppData", "Roaming");
    fs.mkdirSync(appDataDir, { recursive: true });
    process.env.APPDATA = appDataDir;

    const { getAppConfigPath } = await import("../settings");
    const result = getAppConfigPath("settings.yaml");
    expect(result).toBe(
      path.join(appDataDir, "nodetool", "settings.yaml")
    );
    expect(fs.existsSync(path.dirname(result))).toBe(true);
  });

  test("creates win32 config path under homedir when APPDATA is not set", async () => {
    setPlatform("win32");
    delete process.env.APPDATA;

    const { getAppConfigPath } = await import("../settings");
    const result = getAppConfigPath("settings.yaml");
    expect(result).toBe(path.join(tempDir, "nodetool", "settings.yaml"));
    expect(fs.existsSync(path.dirname(result))).toBe(true);
  });

  test("falls back to cwd/data for unknown platform", async () => {
    setPlatform("aix" as NodeJS.Platform);
    const { getAppConfigPath } = await import("../settings");
    const result = getAppConfigPath("settings.yaml");
    expect(result).toBe(path.join(process.cwd(), "data", "settings.yaml"));
  });

  test("throws on empty filename", async () => {
    const { getAppConfigPath } = await import("../settings");
    expect(() => getAppConfigPath("")).toThrow("Invalid filename provided");
  });

  test("throws on non-string filename", async () => {
    const { getAppConfigPath } = await import("../settings");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getAppConfigPath(null as any)).toThrow(
      "Invalid filename provided"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getAppConfigPath(undefined as any)).toThrow(
      "Invalid filename provided"
    );
  });
});

// ---------------------------------------------------------------------------
// readSettings — cache, edge-case YAML, error handling
// ---------------------------------------------------------------------------

describe("readSettings", () => {
  test("returns cached settings on second call without re-reading disk", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, "settings.yaml");
    fs.writeFileSync(settingsPath, yaml.dump({ cached: true }), "utf8");

    const { readSettings } = await import("../settings");

    // First read — populates cache
    const first = readSettings();
    expect(first).toEqual({ cached: true });

    // Mutate file on disk
    fs.writeFileSync(settingsPath, yaml.dump({ cached: false }), "utf8");

    // Second read — should still return cached value
    const second = readSettings();
    expect(second).toEqual({ cached: true });
  });

  test("returns empty object when YAML parses to a string", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      "just a plain string\n",
      "utf8"
    );

    const { readSettings } = await import("../settings");
    expect(readSettings()).toEqual({});
  });

  test("returns empty object when YAML parses to an array", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      yaml.dump(["a", "b", "c"]),
      "utf8"
    );

    const { readSettings } = await import("../settings");
    expect(readSettings()).toEqual({});
  });

  test("returns empty object when YAML parses to a number", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      "42\n",
      "utf8"
    );

    const { readSettings } = await import("../settings");
    expect(readSettings()).toEqual({});
  });

  test("returns empty object when YAML parses to null (empty file)", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      "",
      "utf8"
    );

    const { readSettings } = await import("../settings");
    expect(readSettings()).toEqual({});
  });

  test("returns empty object when YAML parses to boolean", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      "true\n",
      "utf8"
    );

    const { readSettings } = await import("../settings");
    expect(readSettings()).toEqual({});
  });

  test("throws on corrupt YAML (invalid syntax)", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      ":\n  bad:\n    - {\n",
      "utf8"
    );

    const { readSettings } = await import("../settings");
    expect(() => readSettings()).toThrow("Failed to read settings");
  });
});

// ---------------------------------------------------------------------------
// readSettingsAsync — cache, non-object YAML, missing file
// ---------------------------------------------------------------------------

describe("readSettingsAsync", () => {
  test("returns cached settings without re-reading disk", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, "settings.yaml");
    fs.writeFileSync(settingsPath, yaml.dump({ asyncCached: 1 }), "utf8");

    const { readSettingsAsync } = await import("../settings");

    const first = await readSettingsAsync();
    expect(first).toEqual({ asyncCached: 1 });

    // Mutate file on disk
    fs.writeFileSync(settingsPath, yaml.dump({ asyncCached: 2 }), "utf8");

    // Second call — returns cache
    const second = await readSettingsAsync();
    expect(second).toEqual({ asyncCached: 1 });
  });

  test("returns empty object when YAML parses to an array", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      yaml.dump([1, 2, 3]),
      "utf8"
    );

    const { readSettingsAsync } = await import("../settings");
    expect(await readSettingsAsync()).toEqual({});
  });

  test("returns empty object when YAML parses to a string", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      "hello world\n",
      "utf8"
    );

    const { readSettingsAsync } = await import("../settings");
    expect(await readSettingsAsync()).toEqual({});
  });

  test("returns empty object when file is missing", async () => {
    const { readSettingsAsync } = await import("../settings");
    expect(await readSettingsAsync()).toEqual({});
  });

  test("throws on corrupt YAML", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      ":\n  bad:\n    - {\n",
      "utf8"
    );

    const { readSettingsAsync } = await import("../settings");
    await expect(readSettingsAsync()).rejects.toThrow("Failed to read settings");
  });
});

// ---------------------------------------------------------------------------
// writeSettings — error handling
// ---------------------------------------------------------------------------

describe("writeSettings (via updateSetting / updateSettings)", () => {
  test("creates settings file when it does not exist", async () => {
    const settingsPath = path.join(
      tempDir,
      ".config",
      "nodetool",
      "settings.yaml"
    );
    expect(fs.existsSync(settingsPath)).toBe(false);

    const { updateSetting } = await import("../settings");
    updateSetting("newKey", "newValue");

    expect(fs.existsSync(settingsPath)).toBe(true);
    const contents = yaml.load(fs.readFileSync(settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(contents).toEqual({ newKey: "newValue" });
  });

  test("updateSetting preserves other keys", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, "settings.yaml");
    fs.writeFileSync(
      settingsPath,
      yaml.dump({ existing: "keep", other: 123 }),
      "utf8"
    );

    const { updateSetting } = await import("../settings");
    const result = updateSetting("newField", true);

    expect(result).toEqual({ existing: "keep", other: 123, newField: true });
    const ondisk = yaml.load(
      fs.readFileSync(settingsPath, "utf8")
    ) as Record<string, unknown>;
    expect(ondisk).toEqual({ existing: "keep", other: 123, newField: true });
  });

  test("updateSettings skips undefined values", async () => {
    const { updateSettings } = await import("../settings");
    updateSettings({ definedKey: "yes", undefinedKey: undefined });

    // Re-import to clear cache
    jest.resetModules();
    jest.spyOn(os, "homedir").mockReturnValue(tempDir);
    const { readSettings: freshRead } = await import("../settings");
    const settings = freshRead();

    expect(settings.definedKey).toBe("yes");
    expect(settings).not.toHaveProperty("undefinedKey");
  });

  test("updateSettings merges into existing settings", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, "settings.yaml");
    fs.writeFileSync(
      settingsPath,
      yaml.dump({ alpha: 1, beta: 2 }),
      "utf8"
    );

    const { updateSettings } = await import("../settings");
    updateSettings({ beta: 99, gamma: 3 });

    const ondisk = yaml.load(
      fs.readFileSync(settingsPath, "utf8")
    ) as Record<string, unknown>;
    expect(ondisk).toEqual({ alpha: 1, beta: 99, gamma: 3 });
  });
});

// ---------------------------------------------------------------------------
// updateSetting — validation
// ---------------------------------------------------------------------------

describe("updateSetting validation", () => {
  test("throws on empty key", async () => {
    const { updateSetting } = await import("../settings");
    expect(() => updateSetting("", "value")).toThrow("Failed to update setting");
  });

  test("throws on non-string key", async () => {
    const { updateSetting } = await import("../settings");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => updateSetting(null as any, "value")).toThrow(
      "Failed to update setting"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => updateSetting(123 as any, "value")).toThrow(
      "Failed to update setting"
    );
  });
});

// ---------------------------------------------------------------------------
// Cache coherency — write then read without re-import
// ---------------------------------------------------------------------------

describe("cache coherency", () => {
  test("readSettings returns updated value after updateSetting", async () => {
    const { readSettings, updateSetting } = await import("../settings");

    // Initial read — empty
    expect(readSettings()).toEqual({});

    // Write a value
    updateSetting("cacheTest", 42);

    // Read should reflect the write through the cache
    const settings = readSettings();
    expect(settings.cacheTest).toBe(42);
  });

  test("readSettings returns updated values after updateSettings", async () => {
    const { readSettings, updateSettings } = await import("../settings");

    expect(readSettings()).toEqual({});

    updateSettings({ a: 1, b: 2 });
    expect(readSettings()).toEqual({ a: 1, b: 2 });

    updateSettings({ b: 20, c: 3 });
    expect(readSettings()).toEqual({ a: 1, b: 20, c: 3 });
  });

  test("readSettingsAsync returns updated value after sync updateSetting", async () => {
    const { readSettingsAsync, updateSetting } = await import("../settings");

    updateSetting("asyncCheck", "ok");
    const settings = await readSettingsAsync();
    expect(settings.asyncCheck).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// setUpdateChannel — persists both channel and flag
// ---------------------------------------------------------------------------

describe("setUpdateChannel persistence", () => {
  test("writes updateChannel and updateChannelConfiguredByUser to disk", async () => {
    const { setUpdateChannel } = await import("../settings");
    setUpdateChannel("nightly");

    // Re-import to clear cache and verify disk
    jest.resetModules();
    jest.spyOn(os, "homedir").mockReturnValue(tempDir);
    const { readSettings } = await import("../settings");
    const settings = readSettings();
    expect(settings.updateChannel).toBe("nightly");
    expect(settings.updateChannelConfiguredByUser).toBe(true);
  });

  test("overwrites previous channel choice", async () => {
    const { setUpdateChannel } = await import("../settings");
    setUpdateChannel("nightly");
    setUpdateChannel("latest");

    jest.resetModules();
    jest.spyOn(os, "homedir").mockReturnValue(tempDir);
    const { readSettings } = await import("../settings");
    const settings = readSettings();
    expect(settings.updateChannel).toBe("latest");
    expect(settings.updateChannelConfiguredByUser).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getUpdateChannel — reads from disk when settings arg is undefined
// ---------------------------------------------------------------------------

describe("getUpdateChannel disk fallback", () => {
  test("falls back to reading settings from disk when undefined is passed", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      yaml.dump({
        updateChannel: "latest",
        updateChannelConfiguredByUser: true,
      }),
      "utf8"
    );

    const { getUpdateChannel } = await import("../settings");
    // Passing undefined forces a disk read
    const result = getUpdateChannel(undefined, "1.0.0-nightly.20250601.1");
    // User explicitly chose "latest", overriding version default of "nightly"
    expect(result).toBe("latest");
  });
});

// ---------------------------------------------------------------------------
// Complex values — nested objects, special types
// ---------------------------------------------------------------------------

describe("complex YAML values", () => {
  test("round-trips nested objects through write and read", async () => {
    const { updateSetting } = await import("../settings");
    const nested = { deep: { level: { key: "value" } }, list: [1, 2, 3] };
    updateSetting("complex", nested);

    jest.resetModules();
    jest.spyOn(os, "homedir").mockReturnValue(tempDir);
    const { readSettings } = await import("../settings");
    const settings = readSettings();
    expect(settings.complex).toEqual(nested);
  });

  test("handles null values in settings", async () => {
    const { updateSetting, readSettings } = await import("../settings");
    updateSetting("nullKey", null);
    const settings = readSettings();
    expect(settings.nullKey).toBeNull();
  });

  test("handles numeric and boolean values", async () => {
    const { updateSettings } = await import("../settings");
    updateSettings({ num: 3.14, flag: true, zero: 0, flagFalse: false });

    jest.resetModules();
    jest.spyOn(os, "homedir").mockReturnValue(tempDir);
    const { readSettings: freshRead } = await import("../settings");
    const settings = freshRead();
    expect(settings.num).toBe(3.14);
    expect(settings.flag).toBe(true);
    expect(settings.zero).toBe(0);
    expect(settings.flagFalse).toBe(false);
  });
});
