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

jest.mock("../config", () => ({
  getCondaEnvPath: jest.fn().mockReturnValue("/mock/conda"),
  getPythonPath: jest.fn().mockReturnValue("/mock/conda/bin/python"),
  getSystemDataPath: jest.fn().mockImplementation((name: string) => `/mock/data/${name}`),
  getLlamaServerPath: jest.fn().mockReturnValue("/mock/conda/bin/llama-server"),
  getOptionalNodeModulesPath: jest.fn().mockReturnValue("/mock/userData/optional-node/node_modules"),
}));

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
  (exec as jest.Mock).mockImplementation(
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
    (fs.access as jest.Mock).mockReset();
    (exec as jest.Mock).mockReset();
  });

  test("returns the documented SystemInfo shape (all keys present)", async () => {
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    mockExec({ python: "Python 3.11.7", "llama-server --version": "llama-server version: 0.0.4500", "nvidia-smi": "" });

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
        "llamaServerInstalled",
        "llamaServerVersion",
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
    (fs.access as jest.Mock).mockRejectedValue(new Error("ENOENT"));
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
    (fs.access as jest.Mock).mockRejectedValue(new Error("ENOENT"));
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
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    mockExec({
      python: "Python 3.12.4",
      "llama-server": new Error("not installed"),
      "nvidia-smi": new Error("no nvidia"),
    });

    const info = await getSystemInfo();
    expect(info.pythonVersion).toBe("3.12.4");
  });

  test("pythonVersion is null when the python invocation fails", async () => {
    (fs.access as jest.Mock).mockRejectedValue(new Error("ENOENT"));
    mockExec({});

    const info = await getSystemInfo();
    expect(info.pythonVersion).toBeNull();
  });

  test("llamaServerInstalled is true when the binary exists", async () => {
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    mockExec({ "llama-server": "version: 0.0.4500" });

    const info = await getSystemInfo();
    expect(info.llamaServerInstalled).toBe(true);
  });

  test("llamaServerInstalled is false when the binary is missing", async () => {
    (fs.access as jest.Mock).mockRejectedValue(new Error("ENOENT"));
    mockExec({});

    const info = await getSystemInfo();
    expect(info.llamaServerInstalled).toBe(false);
  });

  test("CUDA detection parses 'CUDA Version: X.Y' from nvidia-smi", async () => {
    (fs.access as jest.Mock).mockRejectedValue(new Error("ENOENT"));
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

    (fs.access as jest.Mock).mockRejectedValue(new Error("ENOENT"));
    mockExec({});

    const info = await getSystemInfo();
    expect(info.cudaAvailable).toBe(false);
    expect(info.cudaVersion).toBeNull();

    if (original) Object.defineProperty(process, "platform", original);
  });
});
