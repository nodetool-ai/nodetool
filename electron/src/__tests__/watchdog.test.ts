/**
 * Watchdog regression tests.
 *
 * Watchdog is the critical surface where Electron 39 / Node 24 risk
 * concentrates: it bridges to `utilityProcess.fork` (Electron-only),
 * `child_process.spawn` (Node 24 stricter validation), and signal
 * handling. We pin:
 *   - Constructor URL parsing (port + host extraction).
 *   - utilityProcess.fork option shape (stdio, serviceName, env, cwd).
 *   - child_process.spawn option shape (shell:false, detached:false,
 *     windowsHide:true, stdio:"pipe").
 *   - Graceful stop sequence (SIGTERM via utilityProcess.kill, then
 *     SIGKILL via process.kill — Electron 39 keeps utilityProcess.kill
 *     synchronous and best-effort).
 *   - Output handler delegation (`onOutput` callback contract).
 *
 * We do NOT test the health-probe loop end-to-end (timing-sensitive).
 */

import { EventEmitter } from "events";

jest.mock("electron", () => {
  const { EventEmitter: EE } = require("events");
  return {
    utilityProcess: {
      fork: jest.fn().mockImplementation(() => {
        const proc = Object.assign(new EE(), {
          pid: 4242,
          stdout: new EE(),
          stderr: new EE(),
          kill: jest.fn().mockReturnValue(true),
          postMessage: jest.fn(),
        });
        process.nextTick(() => proc.emit("spawn"));
        return proc;
      }),
    },
  };
});

const electronMock = jest.requireMock("electron") as {
  utilityProcess: { fork: jest.Mock };
};

jest.mock("../logger", () => ({ logMessage: jest.fn() }));
jest.mock("../httpProbe", () => ({
  probeHttpOk: jest.fn().mockResolvedValue(true),
}));

jest.mock("child_process", () => ({ spawn: jest.fn() }));

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  };
});

import { Watchdog } from "../watchdog";

const { spawn } = require("child_process");

describe("Watchdog constructor: healthUrl parsing", () => {
  test("extracts port + host from a standard http URL", () => {
    const wd = new Watchdog({
      name: "x",
      modulePath: "/m",
      env: {},
      pidFilePath: "/tmp/x.pid",
      healthUrl: "http://127.0.0.1:7777/health",
    });
    expect((wd as any).healthPort).toBe(7777);
    expect((wd as any).healthHost).toBe("127.0.0.1");
  });

  test("extracts port + host from an https URL", () => {
    const wd = new Watchdog({
      name: "x",
      modulePath: "/m",
      env: {},
      pidFilePath: "/tmp/x.pid",
      healthUrl: "https://example.com:8443/healthz",
    });
    expect((wd as any).healthPort).toBe(8443);
    expect((wd as any).healthHost).toBe("example.com");
  });

  test("defaults to 80 / 443 when port is omitted", () => {
    const wdHttp = new Watchdog({
      name: "x",
      modulePath: "/m",
      env: {},
      pidFilePath: "/tmp/x.pid",
      healthUrl: "http://example.com/health",
    });
    expect((wdHttp as any).healthPort).toBe(80);

    const wdHttps = new Watchdog({
      name: "x",
      modulePath: "/m",
      env: {},
      pidFilePath: "/tmp/x.pid",
      healthUrl: "https://example.com/health",
    });
    expect((wdHttps as any).healthPort).toBe(443);
  });

  test("respects an explicit healthPort override", () => {
    const wd = new Watchdog({
      name: "x",
      modulePath: "/m",
      env: {},
      pidFilePath: "/tmp/x.pid",
      healthUrl: "http://example.com/health",
      healthPort: 9000,
      healthHost: "10.0.0.1",
    });
    expect((wd as any).healthPort).toBe(9000);
    expect((wd as any).healthHost).toBe("10.0.0.1");
  });
});

describe("Watchdog: utilityProcess.fork option contract (fork mode)", () => {
  beforeEach(() => {
    (electronMock.utilityProcess.fork as jest.Mock).mockClear();
  });

  test("forks with stdio:'pipe', cwd, env, and serviceName", async () => {
    const wd = new Watchdog({
      name: "nodetool",
      modulePath: "/mock/server.mjs",
      env: { PORT: "7777" },
      cwd: "/mock/cwd",
      pidFilePath: "/mock/x.pid",
      healthUrl: "http://127.0.0.1:7777/health",
    });

    await (wd as any).forkUtilityProcess();

    expect(electronMock.utilityProcess.fork).toHaveBeenCalledWith(
      "/mock/server.mjs",
      [],
      expect.objectContaining({
        stdio: "pipe",
        cwd: "/mock/cwd",
        serviceName: "nodetool",
        env: expect.objectContaining({ PORT: "7777" }),
      }),
    );
  });

  test("passes through args[] when provided (dev-server-runner case)", async () => {
    const wd = new Watchdog({
      name: "nodetool",
      modulePath: "/mock/dev-server-runner.cjs",
      args: ["/mock/server.ts"],
      env: {},
      pidFilePath: "/mock/x.pid",
      healthUrl: "http://127.0.0.1:7777/health",
    });

    await (wd as any).forkUtilityProcess();

    expect(electronMock.utilityProcess.fork).toHaveBeenCalledWith(
      "/mock/dev-server-runner.cjs",
      ["/mock/server.ts"],
      expect.any(Object),
    );
  });
});

describe("Watchdog: child_process.spawn option contract (spawn mode)", () => {
  beforeEach(() => {
    (spawn as jest.Mock).mockReset();
  });

  test("spawns with stdio:'pipe', shell:false, detached:false, windowsHide:true", async () => {
    const proc = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      pid: 1234,
      killed: false,
      kill: jest.fn(),
    });
    (spawn as jest.Mock).mockReturnValue(proc);

    const wd = new Watchdog({
      name: "llama-server",
      command: "/mock/llama-server",
      args: ["--port", "8080"],
      env: { LLAMA_HOME: "/mock" },
      cwd: "/mock/cwd",
      pidFilePath: "/mock/llama.pid",
      healthUrl: "http://127.0.0.1:8080/health",
    });

    const startPromise = (wd as any).spawnChildProcess();
    process.nextTick(() => proc.emit("spawn"));
    await startPromise;

    expect(spawn).toHaveBeenCalledWith(
      "/mock/llama-server",
      ["--port", "8080"],
      expect.objectContaining({
        stdio: "pipe",
        shell: false,
        detached: false,
        windowsHide: true,
        env: expect.objectContaining({ LLAMA_HOME: "/mock" }),
        cwd: "/mock/cwd",
      }),
    );
  });

  test("rejects with a wrapped error if spawn() throws synchronously", async () => {
    (spawn as jest.Mock).mockImplementation(() => {
      throw new Error("EACCES");
    });

    const wd = new Watchdog({
      name: "x",
      command: "/missing",
      args: [],
      env: {},
      pidFilePath: "/tmp/x.pid",
      healthUrl: "http://127.0.0.1:9999/health",
    });

    await expect((wd as any).spawnChildProcess()).rejects.toThrow(
      /failed to spawn.*EACCES/,
    );
  });
});

describe("Watchdog: graceful stop sequence", () => {
  test("fork mode: utilityProcess.kill() is called once", async () => {
    const utilProc = Object.assign(new EventEmitter(), {
      pid: 4242,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: jest.fn().mockReturnValue(true),
    });
    (electronMock.utilityProcess.fork as jest.Mock).mockReturnValueOnce(utilProc);

    const wd = new Watchdog({
      name: "nodetool",
      modulePath: "/mock/server.mjs",
      env: {},
      pidFilePath: "/mock/x.pid",
      healthUrl: "http://127.0.0.1:7777/health",
      gracefulStopTimeoutMs: 100,
    });

    const fork = (wd as any).forkUtilityProcess();
    process.nextTick(() => utilProc.emit("spawn"));
    await fork;

    // Force isPidAlive to return false so the stop loop exits quickly.
    jest.spyOn(wd as any, "isPidAlive").mockResolvedValue(false);
    await wd.stopGracefully();

    expect(utilProc.kill).toHaveBeenCalledTimes(1);
  });

  test("spawn mode: SIGTERM first, SIGKILL after timeout if still alive", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      pid: 5555,
      killed: false,
      kill: jest.fn(),
    });
    (spawn as jest.Mock).mockReturnValue(child);

    const wd = new Watchdog({
      name: "x",
      command: "/mock/x",
      args: [],
      env: {},
      pidFilePath: "/tmp/x.pid",
      healthUrl: "http://127.0.0.1:9000/health",
      gracefulStopTimeoutMs: 50,
    });

    const startPromise = (wd as any).spawnChildProcess();
    process.nextTick(() => child.emit("spawn"));
    await startPromise;

    // Pretend the process is still alive throughout the grace window so
    // the SIGKILL escalation triggers.
    jest.spyOn(wd as any, "isPidAlive").mockResolvedValue(true);

    await wd.stopGracefully();

    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });
});

describe("Watchdog: output handler delegation", () => {
  test("onOutput receives trimmed lines (stdout)", async () => {
    const proc = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      pid: 1,
      killed: false,
      kill: jest.fn(),
    });
    (spawn as jest.Mock).mockReturnValue(proc);

    const lines: string[] = [];
    const wd = new Watchdog({
      name: "x",
      command: "/x",
      args: [],
      env: {},
      pidFilePath: "/tmp/x.pid",
      healthUrl: "http://127.0.0.1:1234/health",
      onOutput: (line) => lines.push(line),
      logOutput: false,
    });

    const startPromise = (wd as any).spawnChildProcess();
    process.nextTick(() => proc.emit("spawn"));
    await startPromise;

    proc.stdout.emit("data", Buffer.from("hello world\n"));
    proc.stderr.emit("data", Buffer.from("  warn: x  \n"));

    expect(lines).toEqual(["hello world", "warn: x"]);
  });
});
