/**
 * systemInfo.ts regression tests.
 *
 * The About dialog payload is the user-visible witness that the migration
 * succeeded — it contains `electronVersion`, `nodeVersion`, `chromeVersion`
 * read straight from `process.versions`. If a key is dropped or renamed
 * during the upgrade, the dialog regresses silently. Lock the shape and
 * the OS/version-string formatting branches.
 */

const electronMock = jest.requireActual("../__mocks__/electron");
jest.mock("electron", () => electronMock);
import * as config from "../config";

// The real config module; only the four path lookups are stubbed so the
// payload does not depend on this machine's conda/python install.
jest.spyOn(config, "getCondaEnvPath").mockReturnValue("/mock/conda");
jest.spyOn(config, "getPythonPath").mockReturnValue("/mock/conda/bin/python");
jest
  .spyOn(config, "getSystemDataPath")
  .mockImplementation((name: string) => `/mock/data/${name}`);
jest
  .spyOn(config, "getOptionalNodeModulesPath")
  .mockReturnValue("/mock/userData/optional-node/node_modules");

jest.mock("../logger", () => ({
  logMessage: jest.fn(),
  LOG_FILE: "/mock/userData/nodetool.log",
}));

jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      access: jest.fn(),
    },
  };
});

const { exec } = require("child_process");
const { promises: fs } = require("fs");

import { getSystemInfo } from "../systemInfo";

function mockExec(map: Record<string, string | Error>): void {
  jest.mocked(exec).mockImplementation(
    (
      cmd: string,
      _opts: unknown,
      cb: (err: Error | null, out?: { stdout: string }) => void,
    ) => {
      // util.promisify(exec) callback contract
      for (const [pattern, value] of Object.entries(map)) {
        if (cmd.includes(pattern)) {
          if (value instanceof Error) {
            cb(value);
          } else {
            cb(null, { stdout: value });
          }
          return;
        }
      }
      cb(new Error("ENOENT"));
    },
  );
}

describe("systemInfo.getSystemInfo()", () => {
  beforeEach(() => {
    jest.mocked(fs.access).mockReset();
    jest.mocked(exec).mockReset();
  });

  test("returns the documented SystemInfo shape (all keys present)", async () => {
    jest.mocked(fs.access).mockResolvedValue(undefined);
    mockExec({ python: "Python 3.11.7", "nvidia-smi": "" });

    const info = await getSystemInfo();

    // Lock the keyset — the renderer's About dialog reads these by name.
    expect(Object.keys(info).sort()).toEqual(
      [
        "appVersion",
        "arch",
        "chromeVersion",
        "condaEnvPath",
        "cudaAvailable",
        "cudaVersion",
        "dataPath",
        "electronVersion",
        "installPath",
        "logsPath",
        "nodeVersion",
        "optionalNodePath",
        "os",
        "osVersion",
        "pythonVersion",
      ].sort(),
    );
  });

  test("reads electronVersion / nodeVersion / chromeVersion from process.versions", async () => {
    jest.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
    mockExec({});

    const info = await getSystemInfo();

    expect(info.appVersion).toBe("0.0.0-test");
    expect(info.nodeVersion).toBe(process.versions.node);
    // electronVersion / chromeVersion are undefined under jest, but the
    // KEY must exist — that's what we're locking.
    expect(info).toHaveProperty("electronVersion");
    expect(info).toHaveProperty("chromeVersion");
  });

  test("getOsName maps process.platform → user-friendly label", async () => {
    const original = Object.getOwnPropertyDescriptor(process, "platform");
    jest.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
    mockExec({});

    Object.defineProperty(process, "platform", { value: "darwin" });
    expect((await getSystemInfo()).os).toBe("macOS");

    Object.defineProperty(process, "platform", { value: "win32" });
    expect((await getSystemInfo()).os).toBe("Windows");

    Object.defineProperty(process, "platform", { value: "linux" });
    expect((await getSystemInfo()).os).toBe("Linux");

    if (original) Object.defineProperty(process, "platform", original);
  });

  test("pythonVersion is parsed out of 'Python X.Y.Z' output", async () => {
    jest.mocked(fs.access).mockResolvedValue(undefined);
    mockExec({
      python: "Python 3.12.4",
      "nvidia-smi": new Error("no nvidia"),
    });

    const info = await getSystemInfo();
    expect(info.pythonVersion).toBe("3.12.4");
  });

  test("pythonVersion is null when the python invocation fails", async () => {
    jest.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
    mockExec({});

    const info = await getSystemInfo();
    expect(info.pythonVersion).toBeNull();
  });

  test("CUDA detection parses 'CUDA Version: X.Y' from nvidia-smi", async () => {
    jest.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
    mockExec({
      "nvidia-smi": "+-------+\n| NVIDIA-SMI 535.54  Driver Version: 535.54  CUDA Version: 12.2 |\n",
    });

    const info = await getSystemInfo();
    expect(info.cudaAvailable).toBe(true);
    expect(info.cudaVersion).toBe("12.2");
  });

  test("CUDA detection reports unavailable when nvidia-smi fails on non-linux/darwin", async () => {
    const original = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });

    jest.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
    mockExec({});

    const info = await getSystemInfo();
    expect(info.cudaAvailable).toBe(false);
    expect(info.cudaVersion).toBeNull();

    if (original) Object.defineProperty(process, "platform", original);
  });
});
