import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";

let tempDir: string;
const originalPlatform = process.platform;
const originalEnv = { ...process.env };

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform });
}

beforeEach(() => {
  jest.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "keychain-prompt-test-"));
  jest.spyOn(os, "homedir").mockReturnValue(tempDir);
  setPlatform("darwin");
  // Don't treat tests as CI for this module under test — we gate explicitly.
  delete process.env.CI;
  delete process.env.NODE_ENV;
  delete process.env.SECRETS_MASTER_KEY;
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  (os.homedir as jest.Mock).mockRestore();
  setPlatform(originalPlatform as NodeJS.Platform);
  process.env = { ...originalEnv };
});

function readPersistedSettings(): Record<string, unknown> {
  const settingsPath = path.join(
    tempDir,
    ".config",
    "nodetool",
    "settings.yaml",
  );
  if (!fs.existsSync(settingsPath)) {
    return {};
  }
  return (yaml.load(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>) ?? {};
}

describe("showKeychainExplanationIfNeeded", () => {
  test("shows dialog on macOS and records acknowledgement on first launch", async () => {
    const { dialog } = await import("electron");
    (dialog.showMessageBox as jest.Mock).mockResolvedValueOnce({ response: 0 });

    const {
      showKeychainExplanationIfNeeded,
      KEYCHAIN_EXPLANATION_ACKNOWLEDGED_KEY,
    } = await import("../keychainPrompt");

    await showKeychainExplanationIfNeeded();

    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    const [options] = (dialog.showMessageBox as jest.Mock).mock.calls[0];
    expect(options.buttons).toEqual(["Continue"]);
    expect(options.title).toMatch(/keychain/i);

    const persisted = readPersistedSettings();
    expect(persisted[KEYCHAIN_EXPLANATION_ACKNOWLEDGED_KEY]).toBe(true);
  });

  test("does not show dialog when already acknowledged", async () => {
    const settingsDir = path.join(tempDir, ".config", "nodetool");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.yaml"),
      yaml.dump({ keychainExplanationAcknowledged: true }),
      "utf8",
    );

    const { dialog } = await import("electron");
    const { showKeychainExplanationIfNeeded } = await import(
      "../keychainPrompt"
    );

    await showKeychainExplanationIfNeeded();

    expect(dialog.showMessageBox).not.toHaveBeenCalled();
  });

  test("does not show dialog on Windows", async () => {
    setPlatform("win32");

    const { dialog } = await import("electron");
    const { showKeychainExplanationIfNeeded } = await import(
      "../keychainPrompt"
    );

    await showKeychainExplanationIfNeeded();

    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    // Should also not write anything to settings on Windows.
    expect(readPersistedSettings()).toEqual({});
  });

  test("skips dialog when SECRETS_MASTER_KEY env is set", async () => {
    process.env.SECRETS_MASTER_KEY = "base64-thing";

    const { dialog } = await import("electron");
    const { showKeychainExplanationIfNeeded } = await import(
      "../keychainPrompt"
    );

    await showKeychainExplanationIfNeeded();

    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    expect(readPersistedSettings()).toEqual({});
  });

  test("skips dialog in CI / test environments", async () => {
    process.env.CI = "true";

    const { dialog } = await import("electron");
    const { showKeychainExplanationIfNeeded } = await import(
      "../keychainPrompt"
    );

    await showKeychainExplanationIfNeeded();

    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    expect(readPersistedSettings()).toEqual({});
  });

  test("shows Linux-specific wording on linux", async () => {
    setPlatform("linux");

    const { dialog } = await import("electron");
    (dialog.showMessageBox as jest.Mock).mockResolvedValueOnce({ response: 0 });

    const { showKeychainExplanationIfNeeded } = await import(
      "../keychainPrompt"
    );

    await showKeychainExplanationIfNeeded();

    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    const [options] = (dialog.showMessageBox as jest.Mock).mock.calls[0];
    expect(options.detail).toMatch(/gnome-keyring|kwallet|secret service/i);
  });

  test("still records acknowledgement if dialog itself throws", async () => {
    const { dialog } = await import("electron");
    (dialog.showMessageBox as jest.Mock).mockRejectedValueOnce(
      new Error("ipc boom"),
    );

    const {
      showKeychainExplanationIfNeeded,
      KEYCHAIN_EXPLANATION_ACKNOWLEDGED_KEY,
    } = await import("../keychainPrompt");

    await expect(showKeychainExplanationIfNeeded()).resolves.toBeUndefined();

    const persisted = readPersistedSettings();
    expect(persisted[KEYCHAIN_EXPLANATION_ACKNOWLEDGED_KEY]).toBe(true);
  });
});
