import cp from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { missingRuntimeDetailsOf, missingRuntimePackageOf } from "@nodetool-ai/protocol";
import { PythonStdioBridge } from "../src/python-stdio-bridge.js";
import { resolvePythonNodeExecutor } from "../src/python-graph-resolver.js";

const bridges: PythonStdioBridge[] = [];
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "nodetool-python-runtime-"));
  vi.stubEnv("HOME", directory);
  vi.stubEnv("USERPROFILE", directory);
  vi.stubEnv("APPDATA", directory);
  vi.stubEnv("XDG_DATA_HOME", directory);
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_PYTHON", "");
  vi.stubEnv("CONDA_PREFIX", "");
  vi.stubEnv("NODETOOL_HOST", "cli");
  vi.stubEnv("NODETOOL_CONDA_ENV", join(directory, "configured"));
});
afterEach(() => {
  for (const bridge of bridges.splice(0)) { bridge.close(); }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});
function interpreter(env: string): string {
  const path = process.platform === "win32" ? join(env, "python.exe") : join(env, "bin", "python");
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, "fixture interpreter");
  return path;
}
function launchProbe() {
  const original = cp.spawn;
  const spy = vi.spyOn(cp, "spawn").mockImplementation((_command, _args, options) =>
    original(process.execPath, [resolve(import.meta.dirname, "fixtures/fake-python-interpreter.mjs")], options)
  );
  const bridge = new PythonStdioBridge({ startupTimeoutMs: 20000, statusTimeoutMs: 20000 });
  bridges.push(bridge);
  return { bridge, spy };
}

describe("configured Python interpreter discovery", () => {
  it.each(["cli", "source"])("uses the documented configured/active precedence on %s", async (host) => {
    const configured = interpreter(join(directory, "configured"));
    const active = interpreter(join(directory, "nodetool"));
    vi.stubEnv("CONDA_PREFIX", join(directory, "nodetool"));
    vi.stubEnv("NODETOOL_HOST", host);
    const { bridge, spy } = launchProbe();
    await bridge.ensureConnected();
    expect(spy.mock.calls[0]?.[0]).toBe(host === "source" ? active : configured);
  }, 25000);

  it("keeps NODETOOL_PYTHON ahead of managed and active candidates", async () => {
    interpreter(join(directory, "configured"));
    const explicit = join(directory, "explicit-python");
    vi.stubEnv("NODETOOL_PYTHON", explicit);
    const { bridge, spy } = launchProbe();
    await bridge.ensureConnected();
    expect(spy.mock.calls[0]?.[0]).toBe(explicit);
  }, 25000);

  it("discovers the install.sh macOS data-dir environment without a manual override", () => {
    const installed = join(directory, "nodetool", "conda_env");
    interpreter(installed);
    vi.stubEnv("NODETOOL_CONDA_ENV", "");
    const bridge = new PythonStdioBridge();
    bridges.push(bridge);
    expect(bridge.isAvailable()).toBe(true);
  });

  it("turns an absent explicit interpreter into id python with missing details", async () => {
    vi.stubEnv("NODETOOL_PYTHON", join(directory, "absent-python"));
    const bridge = new PythonStdioBridge();
    bridges.push(bridge);
    const error = await bridge.ensureConnected().catch((cause: unknown) => cause);
    expect(missingRuntimePackageOf(error)).toBe("python");
    expect(missingRuntimeDetailsOf(error)?.reason).toBe("missing");
  });

  it("reports id python when no interpreter candidate exists", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const bridge = new PythonStdioBridge();
    bridges.push(bridge);
    const error = await bridge.ensureConnected().catch((cause: unknown) => cause);
    expect(missingRuntimePackageOf(error)).toBe("python");
    expect(missingRuntimeDetailsOf(error)).toMatchObject({ missing: "Python worker", reason: "missing" });
  });

  it("maps known Python-pack node types without a bridge and preserves unknown-node fallback", () => {
    let failure: unknown;
    try { resolvePythonNodeExecutor(null, { id: "python", type: "huggingface.test.Unavailable" }); }
    catch (error) { failure = error; }
    expect(missingRuntimePackageOf(failure)).toBe("python");
    expect(resolvePythonNodeExecutor(null, { id: "unknown", type: "example.Unknown" })).toBeNull();
  });
});
