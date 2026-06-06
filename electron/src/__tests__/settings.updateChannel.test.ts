import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";

let tempDir: string;
const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform });
}

beforeEach(() => {
  jest.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-uc-test-"));
  jest.spyOn(os, "homedir").mockReturnValue(tempDir);
  setPlatform("linux");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  (os.homedir as jest.Mock).mockRestore();
  setPlatform(originalPlatform as NodeJS.Platform);
});

describe("normalizeUpdateChannel", () => {
  test('returns "latest" for "latest"', async () => {
    const { normalizeUpdateChannel } = await import("../settings");
    expect(normalizeUpdateChannel("latest")).toBe("latest");
  });

  test('returns "nightly" for "nightly"', async () => {
    const { normalizeUpdateChannel } = await import("../settings");
    expect(normalizeUpdateChannel("nightly")).toBe("nightly");
  });

  test("returns null for unknown strings", async () => {
    const { normalizeUpdateChannel } = await import("../settings");
    expect(normalizeUpdateChannel("beta")).toBeNull();
    expect(normalizeUpdateChannel("stable")).toBeNull();
    expect(normalizeUpdateChannel("")).toBeNull();
  });

  test("returns null for non-string values", async () => {
    const { normalizeUpdateChannel } = await import("../settings");
    expect(normalizeUpdateChannel(42)).toBeNull();
    expect(normalizeUpdateChannel(null)).toBeNull();
    expect(normalizeUpdateChannel(undefined)).toBeNull();
    expect(normalizeUpdateChannel(true)).toBeNull();
  });
});

describe("getUpdateChannel", () => {
  test("returns nightly for nightly version when user has not configured", async () => {
    const { getUpdateChannel } = await import("../settings");
    const result = getUpdateChannel({}, "1.0.0-nightly.20250101.1");
    expect(result).toBe("nightly");
  });

  test("returns latest for stable version when user has not configured", async () => {
    const { getUpdateChannel } = await import("../settings");
    const result = getUpdateChannel({}, "1.0.0");
    expect(result).toBe("latest");
  });

  test("respects user-configured channel over version default", async () => {
    const { getUpdateChannel } = await import("../settings");
    const settings = {
      updateChannel: "nightly",
      updateChannelConfiguredByUser: true,
    };
    const result = getUpdateChannel(settings, "1.0.0");
    expect(result).toBe("nightly");
  });

  test("ignores stored channel if not configured by user", async () => {
    const { getUpdateChannel } = await import("../settings");
    const settings = {
      updateChannel: "nightly",
      updateChannelConfiguredByUser: false,
    };
    const result = getUpdateChannel(settings, "1.0.0");
    expect(result).toBe("latest");
  });

  test("falls back to version default if stored channel is invalid", async () => {
    const { getUpdateChannel } = await import("../settings");
    const settings = {
      updateChannel: "beta",
      updateChannelConfiguredByUser: true,
    };
    const result = getUpdateChannel(settings, "2.0.0-nightly.20250601.3");
    expect(result).toBe("nightly");
  });

  test("reads from settings file when no settings argument provided", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      yaml.dump({
        updateChannel: "nightly",
        updateChannelConfiguredByUser: true,
      }),
      "utf8"
    );

    const { getUpdateChannel } = await import("../settings");
    const result = getUpdateChannel(undefined, "1.0.0");
    expect(result).toBe("nightly");
  });
});

describe("setUpdateChannel", () => {
  test("persists channel choice to settings file", async () => {
    const { setUpdateChannel } = await import("../settings");
    const result = setUpdateChannel("nightly");
    expect(result).toBe("nightly");

    const settingsPath = path.join(
      tempDir,
      ".config",
      "nodetool",
      "settings.yaml"
    );
    const contents = yaml.load(
      fs.readFileSync(settingsPath, "utf8")
    ) as Record<string, unknown>;
    expect(contents.updateChannel).toBe("nightly");
    expect(contents.updateChannelConfiguredByUser).toBe(true);
  });

  test("returns the channel that was set", async () => {
    const { setUpdateChannel } = await import("../settings");
    expect(setUpdateChannel("latest")).toBe("latest");
    expect(setUpdateChannel("nightly")).toBe("nightly");
  });
});

describe("getModelServiceStartupDefaults", () => {
  test("returns startLlamaCppOnStartup true for llama_cpp backend", async () => {
    const { getModelServiceStartupDefaults } = await import("../settings");
    expect(getModelServiceStartupDefaults("llama_cpp")).toEqual({
      startLlamaCppOnStartup: true,
    });
  });

  test("returns startLlamaCppOnStartup false for other backends", async () => {
    const { getModelServiceStartupDefaults } = await import("../settings");
    expect(getModelServiceStartupDefaults("onnx")).toEqual({
      startLlamaCppOnStartup: false,
    });
    expect(getModelServiceStartupDefaults(undefined)).toEqual({
      startLlamaCppOnStartup: false,
    });
    expect(getModelServiceStartupDefaults(null)).toEqual({
      startLlamaCppOnStartup: false,
    });
  });
});
