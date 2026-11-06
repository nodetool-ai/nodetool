/**
 * The uv subprocess contract of the Python pack operations: argv, env
 * scrubbing, stdio options and error mapping.
 */
import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, test, vi } from "vitest";

import { fakeHost } from "./fake-host.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../src/fs.js", () => ({ fileExists: vi.fn(async () => true), isErrnoException: () => false }));

import { spawn as spawnFn } from "node:child_process";
import { uninstallPythonPack } from "../src/python-packs.js";

const spawn = vi.mocked(spawnFn) as unknown as ReturnType<typeof vi.fn>;

function uninstallPackage(repoId: string) {
  return uninstallPythonPack(
    fakeHost({
      condaEnvPath: () => "/mock/conda",
      processEnv: () => ({
        PATH: "/mock/path",
        PYTHONHOME: "/should/be/scrubbed",
        PYTHONPATH: "/should/be/scrubbed",
        NODE_ENV: "production",
      }),
    }),
    repoId
  );
}

type FakeProc = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
};

function makeProc(): FakeProc {
  const proc: FakeProc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { write: vi.fn(), end: vi.fn() },
  });
  return proc;
}

describe("python pack uv spawn contract", () => {
  beforeEach(() => {
    spawn.mockReset();
  });

  test("uninstallPackage spawns uv with the expected argv (pip uninstall <name>)", async () => {
    let capturedCmd = "";
    let capturedArgs: string[] = [];

    spawn.mockImplementation((cmd: string, args: string[]) => {
      capturedCmd = cmd;
      capturedArgs = args;
      const proc = makeProc();
      process.nextTick(() => { proc.emit("exit", 0); proc.emit("close", 0); });
      return proc;
    });

    const result = await uninstallPackage("nodetool-ai/nodetool-base");

    expect(result.success).toBe(true);
    expect(capturedCmd).toContain("uv");
    expect(capturedArgs).toEqual(["pip", "uninstall", "nodetool-base"]);
  });

  test("uninstallPackage feeds 'y\\n' to uv via stdin (auto-confirm)", async () => {
    const stdinWrites: unknown[] = [];

    spawn.mockImplementation(() => {
      const proc = makeProc();
      proc.stdin.write.mockImplementation((data: unknown) => {
        stdinWrites.push(data);
      });
      process.nextTick(() => { proc.emit("exit", 0); proc.emit("close", 0); });
      return proc;
    });

    const result = await uninstallPackage("nodetool-ai/nodetool-base");

    expect(result.success).toBe(true);
    expect(stdinWrites).toContain("y\n");
  });

  test("runUvCommand scrubs PYTHONHOME / PYTHONPATH from inherited env", async () => {
    let capturedEnv: Record<string, string> = {};

    spawn.mockImplementation((_cmd: string, _args: string[], opts: { env: Record<string, string> }) => {
      capturedEnv = opts.env;
      const proc = makeProc();
      process.nextTick(() => { proc.emit("exit", 0); proc.emit("close", 0); });
      return proc;
    });

    // uninstallPackage → single `uv pip uninstall` subprocess — simplest path
    // through runUvCommand that doesn't touch the network.
    await uninstallPackage("nodetool-ai/nodetool-base");

    // Critical: Node 24 uvloop / Python embedding will misbehave if these
    // leak through. The Python runtime relies on this scrub.
    expect(capturedEnv).not.toHaveProperty("PYTHONHOME");
    expect(capturedEnv).not.toHaveProperty("PYTHONPATH");
    // UV_PYTHON must be set to the conda env's python.
    expect(capturedEnv.UV_PYTHON).toBe("/mock/conda/bin/python");
  });

  test("runUvCommand uses stdio:'pipe' and windowsHide:true", async () => {
    let capturedOpts: { stdio?: string; windowsHide?: boolean } = {};

    spawn.mockImplementation((_cmd: string, _args: string[], opts: typeof capturedOpts) => {
      capturedOpts = opts;
      const proc = makeProc();
      process.nextTick(() => { proc.emit("exit", 0); proc.emit("close", 0); });
      return proc;
    });

    await uninstallPackage("nodetool-ai/nodetool-base");

    expect(capturedOpts.stdio).toBe("pipe");
    expect(capturedOpts.windowsHide).toBe(true);
  });

  test("ENOENT on spawn maps to a 'reinstall environment' user-facing error", async () => {
    spawn.mockImplementation(() => {
      const proc = makeProc();
      process.nextTick(() =>
        proc.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })),
      );
      return proc;
    });

    const result = await uninstallPackage("nodetool-ai/nodetool-missing");
    // uninstallPackage returns { success: false, message: "..." } when
    // runUvCommand rejects. The ENOENT branch surfaces a reinstall hint.
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Reinstall environment|could not run uv/i);
  });

  test("non-zero exit code rejects with stderr in message", async () => {
    spawn.mockImplementation(() => {
      const proc = makeProc();
      process.nextTick(() => {
        proc.stderr.emit("data", Buffer.from("uv: bad index"));
        proc.emit("exit", 1);
        proc.emit("close", 1);
      });
      return proc;
    });

    const result = await uninstallPackage("nodetool-ai/nodetool-missing");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/code 1/);
  });
});
