import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-micromamba-"));

jest.mock("electron", () => ({
  app: { getPath: jest.fn(() => userData), isPackaged: false, getAppPath: jest.fn(() => userData) },
  dialog: { showOpenDialog: jest.fn() },
  BrowserWindow: { getFocusedWindow: jest.fn(), getAllWindows: jest.fn(() => []) },
}));
jest.mock("../logger", () => ({ logMessage: jest.fn() }));
jest.mock("../events", () => ({
  emitBootMessage: jest.fn(),
  emitServerLog: jest.fn(),
  emitUpdateProgress: jest.fn(),
}));
jest.mock("../types.d", () => ({
  IpcChannels: {
    INSTALL_TO_LOCATION: "install-to-location",
    SELECT_CUSTOM_LOCATION: "select-custom-location",
  },
}));
jest.mock("../ipc", () => ({ createIpcMainHandler: jest.fn() }));
jest.mock("../settings", () => ({ readSettings: jest.fn(() => ({})), updateSettings: jest.fn() }));
jest.mock("../python", () => ({ getDefaultInstallLocation: jest.fn() }));

import { installCondaPackageBySpec } from "../installer";

const describeOnPosix = process.platform === "win32" ? describe.skip : describe;

describeOnPosix("micromamba commands", () => {
  const callLog = path.join(userData, "calls.log");
  const lockPath = path.join(userData, "micromamba", "pkgs", "pkgs.lock");
  const previousExe = process.env.MICROMAMBA_EXE;

  beforeAll(() => {
    // A stand-in micromamba: answers --version, and otherwise records when
    // each command starts and ends so overlapping runs are visible.
    const fake = path.join(userData, "fake-micromamba");
    fs.writeFileSync(
      fake,
      [
        "#!/bin/sh",
        'if [ "$1" = "--version" ]; then exit 0; fi',
        `echo "start $5" >> "${callLog}"`,
        "sleep 0.2",
        `echo "end $5" >> "${callLog}"`,
      ].join("\n"),
      { mode: 0o755 }
    );
    process.env.MICROMAMBA_EXE = fake;
  });

  afterAll(() => {
    if (previousExe === undefined) {
      delete process.env.MICROMAMBA_EXE;
    } else {
      process.env.MICROMAMBA_EXE = previousExe;
    }
    fs.rmSync(userData, { recursive: true, force: true });
  });

  beforeEach(() => {
    fs.rmSync(callLog, { force: true });
  });

  it("runs one command at a time against the shared package cache", async () => {
    await Promise.all([
      installCondaPackageBySpec("/env", ["ffmpeg"]),
      installCondaPackageBySpec("/env", ["git"]),
    ]);

    expect(fs.readFileSync(callLog, "utf8").trim().split("\n")).toEqual([
      "start ffmpeg",
      "end ffmpeg",
      "start git",
      "end git",
    ]);
  });

  it("leaves a fresh package-cache lock in place", async () => {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, "");

    await installCondaPackageBySpec("/env", ["ffmpeg"]);

    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it("removes a package-cache lock older than the stale threshold", async () => {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, "");
    const old = new Date(Date.now() - 60 * 60 * 1000);
    fs.utimesSync(lockPath, old, old);

    await installCondaPackageBySpec("/env", ["ffmpeg"]);

    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
