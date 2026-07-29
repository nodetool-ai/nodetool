import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach
} from "vitest";
import { EventEmitter } from "node:events";
import { join } from "node:path";

const hoisted = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  homedirMock: vi.fn()
}));

vi.mock("node:child_process", () => ({ spawn: hoisted.spawnMock }));
vi.mock("node:fs", () => ({
  existsSync: hoisted.existsSyncMock,
  readFileSync: hoisted.readFileSyncMock
}));
vi.mock("node:os", () => ({ homedir: hoisted.homedirMock }));

import {
  scanPythonPackage,
  findWrittenMetadataPath,
  resolvePythonBin,
  PythonScanError
} from "../src/python-package-scan.js";

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

function makeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

const originalPlatform = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

beforeEach(() => {
  hoisted.spawnMock.mockReset();
  hoisted.existsSyncMock.mockReset();
  hoisted.readFileSyncMock.mockReset();
  hoisted.homedirMock.mockReset();
  hoisted.existsSyncMock.mockReturnValue(false);
  hoisted.homedirMock.mockReturnValue("/home/u");
});

afterEach(() => {
  setPlatform(originalPlatform);
  vi.unstubAllEnvs();
});

describe("scanPythonPackage", () => {
  it("parses stdout JSON on a clean exit (no --write)", async () => {
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);

    const progress: string[] = [];
    const promise = scanPythonPackage({
      packageDir: "/pkg",
      python: "python3",
      onProgress: (l) => progress.push(l)
    });

    child.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ name: "nodetool-x", version: "1.2.3" }))
    );
    child.stderr.emit("data", Buffer.from("SCAN begin\nnoise\nSCAN end\n"));
    child.emit("close", 0);

    const result = await promise;
    expect(result.metadata.name).toBe("nodetool-x");
    expect(result.metadata.version).toBe("1.2.3");
    expect(result.stderr).toContain("SCAN begin");
    // Only SCAN-prefixed lines are forwarded to onProgress.
    expect(progress).toEqual(["SCAN begin", "SCAN end"]);
  });

  it("uses resolvePythonBin when python is not provided", async () => {
    vi.stubEnv("NODETOOL_PYTHON", "/custom/py");
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);

    const promise = scanPythonPackage({ packageDir: "/pkg" });
    child.stdout.emit("data", Buffer.from("{}"));
    child.emit("close", 0);
    await promise;

    expect(hoisted.spawnMock).toHaveBeenCalledTimes(1);
    expect(hoisted.spawnMock.mock.calls[0][0]).toBe("/custom/py");
  });

  it("builds the argument list including enrich/write/verbose flags", async () => {
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);
    hoisted.readFileSyncMock.mockReturnValue("{}");

    const promise = scanPythonPackage({
      packageDir: "/pkg",
      python: "python3",
      enrich: true,
      write: true,
      verbose: true
    });
    child.stderr.emit("data", Buffer.from("SCAN write path=/abs/meta.json\n"));
    child.emit("close", 0);
    await promise;

    const args = hoisted.spawnMock.mock.calls[0][1] as string[];
    expect(args).toEqual([
      "-m",
      "nodetool.package_tools",
      "scan",
      "--package-dir",
      "/pkg",
      "--enrich",
      "--write",
      "--verbose"
    ]);
  });

  it("omits optional flags when not requested", async () => {
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);

    const promise = scanPythonPackage({ packageDir: "/pkg", python: "py" });
    child.stdout.emit("data", Buffer.from("{}"));
    child.emit("close", 0);
    await promise;

    const args = hoisted.spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain("--enrich");
    expect(args).not.toContain("--write");
    expect(args).not.toContain("--verbose");
  });

  it("reads the written metadata file in --write mode (absolute path)", async () => {
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);
    hoisted.readFileSyncMock.mockReturnValue(
      JSON.stringify({ name: "written-pkg" })
    );

    const promise = scanPythonPackage({
      packageDir: "/pkg",
      python: "py",
      write: true
    });
    child.stderr.emit("data", Buffer.from("SCAN write path=/abs/meta.json\n"));
    child.emit("close", 0);

    const result = await promise;
    expect(result.metadata.name).toBe("written-pkg");
    expect(hoisted.readFileSyncMock).toHaveBeenCalledWith(
      "/abs/meta.json",
      "utf8"
    );
  });

  it("joins a relative written path against packageDir in --write mode", async () => {
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);
    hoisted.readFileSyncMock.mockReturnValue(JSON.stringify({ name: "rel" }));

    const promise = scanPythonPackage({
      packageDir: "/pkg",
      python: "py",
      write: true
    });
    child.stderr.emit("data", Buffer.from("SCAN write path=meta.json\n"));
    child.emit("close", 0);

    await promise;
    expect(hoisted.readFileSyncMock).toHaveBeenCalledWith(
      join("/pkg", "meta.json"),
      "utf8"
    );
  });

  it("rejects when --write mode reports no write path line", async () => {
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);

    const promise = scanPythonPackage({
      packageDir: "/pkg",
      python: "py",
      write: true
    });
    child.stderr.emit("data", Buffer.from("SCAN begin\nSCAN end\n"));
    child.emit("close", 0);

    await expect(promise).rejects.toThrow(/did not report a SCAN write path/);
    await promise.catch((e) => {
      expect(e).toBeInstanceOf(PythonScanError);
    });
  });

  it("rejects with PythonScanError on a nonzero exit code", async () => {
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);

    const promise = scanPythonPackage({ packageDir: "/pkg", python: "py" });
    child.stderr.emit("data", Buffer.from("boom traceback\n"));
    child.emit("close", 2);

    await expect(promise).rejects.toMatchObject({
      name: "PythonScanError",
      exitCode: 2,
      stderr: "boom traceback\n"
    });
  });

  it("rejects with PythonScanError when the process fails to spawn", async () => {
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);

    const promise = scanPythonPackage({ packageDir: "/pkg", python: "py" });
    child.stderr.emit("data", Buffer.from("partial stderr"));
    child.emit("error", new Error("ENOENT"));

    await expect(promise).rejects.toMatchObject({
      name: "PythonScanError",
      exitCode: null
    });
    await promise.catch((e: PythonScanError) => {
      expect(e.message).toContain("Failed to spawn python: ENOENT");
      expect(e.stderr).toBe("partial stderr");
    });
  });

  it("rejects with PythonScanError when stdout is not valid JSON", async () => {
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);

    const promise = scanPythonPackage({ packageDir: "/pkg", python: "py" });
    child.stdout.emit("data", Buffer.from("not json {"));
    child.emit("close", 0);

    await expect(promise).rejects.toThrow(/Failed to parse scanner output/);
  });

  it("flushes a trailing progress line that arrives without a newline", async () => {
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);

    const progress: string[] = [];
    const promise = scanPythonPackage({
      packageDir: "/pkg",
      python: "py",
      onProgress: (l) => progress.push(l)
    });
    // No trailing newline: the line is only flushed on close.
    child.stderr.emit("data", Buffer.from("SCAN end"));
    child.stdout.emit("data", Buffer.from("{}"));
    child.emit("close", 0);

    await promise;
    expect(progress).toEqual(["SCAN end"]);
  });

  it("ignores non-SCAN trailing stderr on flush", async () => {
    const child = makeChild();
    hoisted.spawnMock.mockReturnValue(child);

    const progress: string[] = [];
    const promise = scanPythonPackage({
      packageDir: "/pkg",
      python: "py",
      onProgress: (l) => progress.push(l)
    });
    child.stderr.emit("data", Buffer.from("plain warning without newline"));
    child.stdout.emit("data", Buffer.from("{}"));
    child.emit("close", 0);

    await promise;
    expect(progress).toEqual([]);
  });
});

describe("findWrittenMetadataPath", () => {
  it("extracts a POSIX path", () => {
    expect(
      findWrittenMetadataPath("SCAN write path=/a/b/meta.json\n")
    ).toBe("/a/b/meta.json");
  });

  it("returns null when absent", () => {
    expect(findWrittenMetadataPath("nothing here")).toBeNull();
  });

  it("requires a .json suffix", () => {
    expect(findWrittenMetadataPath("SCAN write path=/a/b/meta.txt\n")).toBeNull();
  });
});

describe("resolvePythonBin", () => {
  it("returns NODETOOL_PYTHON when set", () => {
    vi.stubEnv("NODETOOL_PYTHON", "/explicit/python");
    expect(resolvePythonBin()).toBe("/explicit/python");
    // existsSync should not even be consulted for the explicit path.
    expect(hoisted.existsSyncMock).not.toHaveBeenCalled();
  });

  it("uses a nodetool-looking CONDA_PREFIX bin when it exists (posix)", () => {
    setPlatform("linux");
    vi.stubEnv("NODETOOL_PYTHON", "");
    vi.stubEnv("CONDA_PREFIX", "/envs/nodetool");
    const expected = join("/envs/nodetool", "bin", "python");
    hoisted.existsSyncMock.mockImplementation((p: string) => p === expected);
    expect(resolvePythonBin()).toBe(expected);
  });

  it("uses the CONDA_PREFIX python.exe on win32", () => {
    setPlatform("win32");
    vi.stubEnv("NODETOOL_PYTHON", "");
    vi.stubEnv("CONDA_PREFIX", "C:/envs/nodetool");
    const expected = join("C:/envs/nodetool", "python.exe");
    hoisted.existsSyncMock.mockImplementation((p: string) => p === expected);
    expect(resolvePythonBin()).toBe(expected);
  });

  it("ignores a CONDA_PREFIX that does not look like nodetool", () => {
    setPlatform("linux");
    vi.stubEnv("NODETOOL_PYTHON", "");
    vi.stubEnv("CONDA_PREFIX", "/envs/some-other-env");
    // existsSync always false -> falls through to "python".
    expect(resolvePythonBin()).toBe("python");
  });

  it("matches CONDA_PREFIX via the /nodetool/conda_env path segment", () => {
    setPlatform("linux");
    vi.stubEnv("NODETOOL_PYTHON", "");
    vi.stubEnv("CONDA_PREFIX", "/opt/nodetool/conda_env");
    const expected = join("/opt/nodetool/conda_env", "bin", "python");
    hoisted.existsSyncMock.mockImplementation((p: string) => p === expected);
    expect(resolvePythonBin()).toBe(expected);
  });

  it("returns the first existing managed candidate on linux", () => {
    setPlatform("linux");
    vi.stubEnv("NODETOOL_PYTHON", "");
    vi.stubEnv("CONDA_PREFIX", "");
    hoisted.homedirMock.mockReturnValue("/home/u");
    const candidate = "/opt/nodetool/conda_env/bin/python";
    hoisted.existsSyncMock.mockImplementation((p: string) => p === candidate);
    expect(resolvePythonBin()).toBe(candidate);
  });

  it("returns a managed candidate on darwin", () => {
    setPlatform("darwin");
    vi.stubEnv("NODETOOL_PYTHON", "");
    vi.stubEnv("CONDA_PREFIX", "");
    hoisted.homedirMock.mockReturnValue("/Users/u");
    const candidate = join("/Users/u", "nodetool_env", "bin", "python");
    hoisted.existsSyncMock.mockImplementation((p: string) => p === candidate);
    expect(resolvePythonBin()).toBe(candidate);
  });

  it("returns a managed candidate on win32", () => {
    setPlatform("win32");
    vi.stubEnv("NODETOOL_PYTHON", "");
    vi.stubEnv("CONDA_PREFIX", "");
    hoisted.homedirMock.mockReturnValue("C:/Users/u");
    const candidate = join(
      "C:/Users/u",
      "Miniconda3",
      "envs",
      "nodetool",
      "python.exe"
    );
    hoisted.existsSyncMock.mockImplementation((p: string) => p === candidate);
    expect(resolvePythonBin()).toBe(candidate);
  });

  it("falls back to 'python' when nothing is found", () => {
    setPlatform("linux");
    vi.stubEnv("NODETOOL_PYTHON", "");
    vi.stubEnv("CONDA_PREFIX", "");
    hoisted.existsSyncMock.mockReturnValue(false);
    expect(resolvePythonBin()).toBe("python");
  });
});
