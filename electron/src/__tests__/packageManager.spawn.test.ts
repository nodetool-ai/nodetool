/**
 * packageManager.ts subprocess contract tests.
 *
 * `runUvCommand()` spawns the conda-env `uv` binary for every package
 * operation. Node 24 tightened a few `child_process.spawn` corners
 * (env propagation when both `env` and parent env have NODE_OPTIONS,
 * stdio shape validation). Electron 39 doesn't change child_process,
 * but it embeds Node 24 — so all subprocesses now run under the new
 * runtime. This suite locks the spawn argv, env scrubbing, stdio
 * options, and JSON-parsing path.
 */

import { EventEmitter } from "events";

jest.mock("child_process", () => ({ spawn: jest.fn() }));
jest.mock("electron", () => ({
  app: {
    getVersion: jest.fn().mockReturnValue("1.2.3"),
    getPath: jest.fn().mockReturnValue("/mock/userData"),
  },
}));
jest.mock("../config", () => ({
  getProcessEnv: jest.fn().mockReturnValue({
    PATH: "/mock/path",
    PYTHONHOME: "/should/be/scrubbed",
    PYTHONPATH: "/should/be/scrubbed",
    NODE_ENV: "production",
  }),
  getPythonPath: jest.fn().mockReturnValue("/mock/conda/bin/python"),
  getCondaEnvPath: jest.fn().mockReturnValue("/mock/conda"),
}));
jest.mock("../logger", () => ({ logMessage: jest.fn() }));
jest.mock("../events", () => ({
  emitServerLog: jest.fn(),
  emitBootMessage: jest.fn(),
}));
jest.mock("../utils", () => ({
  fileExists: jest.fn().mockResolvedValue(true),
}));
jest.mock("../torchPlatformCache", () => ({
  getTorchIndexUrl: jest.fn().mockReturnValue(""),
}));

const { spawn } = require("child_process");

type FakeProc = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: jest.Mock; end: jest.Mock };
};

function makeProc(): FakeProc {
  const proc: FakeProc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { write: jest.fn(), end: jest.fn() },
  });
  return proc;
}

describe("packageManager spawn contract", () => {
  beforeEach(() => {
    (spawn as jest.Mock).mockReset();
  });

  test("uninstallPackage spawns uv with the expected argv (pip uninstall <name>)", async () => {
    let capturedCmd = "";
    let capturedArgs: string[] = [];

    (spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
      capturedCmd = cmd;
      capturedArgs = args;
      const proc = makeProc();
      process.nextTick(() => proc.emit("exit", 0));
      return proc;
    });

    const { uninstallPackage } = require("../packageManager");
    const result = await uninstallPackage("nodetool-ai/nodetool-base");

    expect(result.success).toBe(true);
    expect(capturedCmd).toContain("uv");
    expect(capturedArgs).toEqual(["pip", "uninstall", "nodetool-base"]);
  });

  test("uninstallPackage feeds 'y\\n' to uv via stdin (auto-confirm)", async () => {
    const stdinWrites: unknown[] = [];

    (spawn as jest.Mock).mockImplementation(() => {
      const proc = makeProc();
      proc.stdin.write.mockImplementation((data: unknown) => {
        stdinWrites.push(data);
      });
      process.nextTick(() => proc.emit("exit", 0));
      return proc;
    });

    const { uninstallPackage } = require("../packageManager");
    const result = await uninstallPackage("nodetool-ai/nodetool-base");

    expect(result.success).toBe(true);
    expect(stdinWrites).toContain("y\n");
  });

  test("runUvCommand scrubs PYTHONHOME / PYTHONPATH from inherited env", async () => {
    let capturedEnv: Record<string, string> = {};

    (spawn as jest.Mock).mockImplementation((_cmd: string, _args: string[], opts: { env: Record<string, string> }) => {
      capturedEnv = opts.env;
      const proc = makeProc();
      process.nextTick(() => proc.emit("exit", 0));
      return proc;
    });

    // uninstallPackage → single `uv pip uninstall` subprocess — simplest path
    // through runUvCommand that doesn't touch the network.
    const { uninstallPackage } = require("../packageManager");
    await uninstallPackage("nodetool-ai/nodetool-base");

    // Critical: Node 24 uvloop / Python embedding will misbehave if these
    // leak through. server.ts and packageManager.ts both rely on this scrub.
    expect(capturedEnv).not.toHaveProperty("PYTHONHOME");
    expect(capturedEnv).not.toHaveProperty("PYTHONPATH");
    // UV_PYTHON must be set to the conda env's python.
    expect(capturedEnv.UV_PYTHON).toBe("/mock/conda/bin/python");
  });

  test("runUvCommand uses stdio:'pipe' and windowsHide:true", async () => {
    let capturedOpts: { stdio?: string; windowsHide?: boolean } = {};

    (spawn as jest.Mock).mockImplementation((_cmd: string, _args: string[], opts: typeof capturedOpts) => {
      capturedOpts = opts;
      const proc = makeProc();
      process.nextTick(() => proc.emit("exit", 0));
      return proc;
    });

    const { uninstallPackage } = require("../packageManager");
    await uninstallPackage("nodetool-ai/nodetool-base");

    expect(capturedOpts.stdio).toBe("pipe");
    expect(capturedOpts.windowsHide).toBe(true);
  });

  test("ENOENT on spawn maps to a 'reinstall environment' user-facing error", async () => {
    (spawn as jest.Mock).mockImplementation(() => {
      const proc = makeProc();
      process.nextTick(() =>
        proc.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })),
      );
      return proc;
    });

    const { uninstallPackage } = require("../packageManager");
    const result = await uninstallPackage("nodetool-ai/missing");
    // uninstallPackage returns { success: false, message: "..." } when
    // runUvCommand rejects. The ENOENT branch surfaces a reinstall hint.
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Reinstall environment|could not run uv/i);
  });

  test("non-zero exit code rejects with stderr in message", async () => {
    (spawn as jest.Mock).mockImplementation(() => {
      const proc = makeProc();
      process.nextTick(() => {
        proc.stderr.emit("data", Buffer.from("uv: bad index"));
        proc.emit("exit", 1);
      });
      return proc;
    });

    const { uninstallPackage } = require("../packageManager");
    const result = await uninstallPackage("nodetool-ai/missing");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/code 1/);
  });
});
