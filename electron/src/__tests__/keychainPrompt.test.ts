import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";
import { setPlatform, useFakeHome } from "../__mocks__/fakeHome";

const originalEnv = { ...process.env };

const home = useFakeHome("keychain-prompt-test-", "darwin");

beforeEach(() => {
  // Don't treat tests as CI for this module under test — we gate explicitly.
  delete process.env.CI;
  delete process.env.NODE_ENV;
  delete process.env.SECRETS_MASTER_KEY;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

function readPersistedSettings(): Record<string, unknown> {
  const settingsPath = path.join(
    home.dir,
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
    jest.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 0 });

    const {
      showKeychainExplanationIfNeeded,
      KEYCHAIN_EXPLANATION_ACKNOWLEDGED_KEY,
    } = await import("../keychainPrompt");

    await showKeychainExplanationIfNeeded();

    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    const [options] = jest.mocked(dialog.showMessageBox).mock.calls[0];
    expect(options.buttons).toEqual(["Continue"]);
    expect(options.title).toMatch(/keychain/i);

    const persisted = readPersistedSettings();
    expect(persisted[KEYCHAIN_EXPLANATION_ACKNOWLEDGED_KEY]).toBe(true);
  });

  test("does not show dialog when already acknowledged", async () => {
    const settingsDir = path.join(home.dir, ".config", "nodetool");
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
    jest.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 0 });

    const { showKeychainExplanationIfNeeded } = await import(
      "../keychainPrompt"
    );

    await showKeychainExplanationIfNeeded();

    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    const [options] = jest.mocked(dialog.showMessageBox).mock.calls[0];
    expect(options.detail).toMatch(/gnome-keyring|kwallet|secret service/i);
  });

  test("still records acknowledgement if dialog itself throws", async () => {
    const { dialog } = await import("electron");
    jest.mocked(dialog.showMessageBox).mockRejectedValueOnce(
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
