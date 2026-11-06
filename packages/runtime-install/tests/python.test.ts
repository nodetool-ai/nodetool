import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeHost } from "./fake-host.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../src/fs.js", () => ({ fileExists: vi.fn(async () => true) }));
vi.mock("@nodetool-ai/protocol/bridge-protocol", () => ({ MIN_NODETOOL_CORE_VERSION: "0.7.0" }));

import { spawn } from "node:child_process";
import {
  canImportNodeToolWorker,
  getInstalledPythonPackageVersion,
  installRequiredPythonPackages,
} from "../src/python.js";

function mockProcess(exitCode: number, stdoutText?: string): EventEmitter {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
  process.nextTick(() => {
    if (stdoutText !== undefined) {
      proc.stdout.emit("data", Buffer.from(stdoutText));
    }
    proc.emit("exit", exitCode);
    proc.emit("close", exitCode);
  });
  return proc;
}

const spawnMock = vi.mocked(spawn) as unknown as ReturnType<typeof vi.fn>;

describe("python helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the installed nodetool-core version", async () => {
    spawnMock.mockImplementationOnce(() => mockProcess(0, "0.7.0\n"));
    await expect(
      getInstalledPythonPackageVersion(fakeHost(), "/env/bin/python", "nodetool-core")
    ).resolves.toBe("0.7.0");
    expect(spawnMock).toHaveBeenCalledWith(
      "/env/bin/python",
      expect.arrayContaining(["-c"]),
      expect.objectContaining({ stdio: ["ignore", "pipe", "ignore"] })
    );
  });

  it("returns null when the package is missing", async () => {
    spawnMock.mockImplementationOnce(() => mockProcess(2));
    const host = fakeHost();
    await expect(getInstalledPythonPackageVersion(host, "/env/bin/python", "nodetool-core")).resolves.toBeNull();
    expect(host.log).not.toHaveBeenCalledWith("error", expect.anything());
  });

  it("checks that nodetool.worker imports", async () => {
    spawnMock.mockImplementationOnce(() => mockProcess(0)).mockImplementationOnce(() => mockProcess(1));
    await expect(canImportNodeToolWorker(fakeHost(), "/env/bin/python")).resolves.toBe(true);
    await expect(canImportNodeToolWorker(fakeHost(), "/env/bin/python")).resolves.toBe(false);
    expect(spawnMock).toHaveBeenCalledWith(
      "/env/bin/python",
      ["-c", "import nodetool.worker"],
      expect.objectContaining({ stdio: "ignore" })
    );
  });

  it("installs nodetool-core at the protocol floor and additional packs unpinned", async () => {
    spawnMock.mockImplementation(() => mockProcess(0));

    await installRequiredPythonPackages(fakeHost(), ["nodetool-ai/nodetool-huggingface"]);

    expect(spawnMock).toHaveBeenCalledWith(
      "/fake/env/bin/uv",
      expect.arrayContaining(["pip", "install", "--system", "nodetool-core>=0.7.0", "nodetool-huggingface"]),
      expect.objectContaining({ stdio: "pipe" })
    );
    const argv = spawnMock.mock.calls[0][1] as string[];
    expect(argv).not.toContain("--prerelease=allow");
    expect(argv.some((arg) => arg.startsWith("nodetool-huggingface=="))).toBe(false);
  });

  it("passes the saved torch backend to uv", async () => {
    spawnMock.mockImplementation(() => mockProcess(0));
    const host = fakeHost();
    host.saved.set("TORCH_PLATFORM_DETECTED", { platform: "cu128", detectedAt: "x" });

    await installRequiredPythonPackages(host);

    const argv = spawnMock.mock.calls[0][1] as string[];
    expect(argv.join(" ")).toContain("--torch-backend");
  });

  it("rejects when uv fails", async () => {
    spawnMock.mockImplementation(() => mockProcess(1));
    await expect(installRequiredPythonPackages(fakeHost())).rejects.toThrow("Command failed with code 1");
  });
});
