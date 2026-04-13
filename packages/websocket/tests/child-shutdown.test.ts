import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { registerChildShutdownHandlers } from "../../../scripts/child-shutdown.mjs";
import { getTsxWatchCommand } from "../../../scripts/dev-commands.mjs";

class FakeProcess extends EventEmitter {
  exit = vi.fn();
  once(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.once(event, listener);
  }
  off(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }
}

class FakeChild extends EventEmitter {
  pid: number | undefined;

  constructor(pid: number | undefined) {
    super();
    this.pid = pid;
  }
}

describe("registerChildShutdownHandlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("kills the Windows child tree and exits the parent on SIGINT", () => {
    const processLike = new FakeProcess();
    const child = new FakeChild(1234);
    const killTree = vi.fn();

    registerChildShutdownHandlers({
      platform: "win32",
      child,
      processLike,
      killTree
    });

    processLike.emit("SIGINT");

    expect(killTree).toHaveBeenCalledWith(1234);
    expect(processLike.exit).toHaveBeenCalledWith(130);
  });

  it("kills the child and exits with code 143 on SIGTERM", () => {
    const processLike = new FakeProcess();
    const child = new FakeChild(5678);
    const killTree = vi.fn();

    registerChildShutdownHandlers({
      platform: "win32",
      child,
      processLike,
      killTree
    });

    processLike.emit("SIGTERM");

    expect(killTree).toHaveBeenCalledWith(5678);
    expect(processLike.exit).toHaveBeenCalledWith(143);
  });

  it("also handles SIGBREAK on Windows", () => {
    const processLike = new FakeProcess();
    const child = new FakeChild(9012);
    const killTree = vi.fn();

    registerChildShutdownHandlers({
      platform: "win32",
      child,
      processLike,
      killTree
    });

    processLike.emit("SIGBREAK");

    expect(killTree).toHaveBeenCalledWith(9012);
    expect(processLike.exit).toHaveBeenCalledWith(1);
  });

  it("kills the child process group on Unix SIGINT", () => {
    const processLike = new FakeProcess();
    const child = new FakeChild(4321);
    const killTree = vi.fn();

    registerChildShutdownHandlers({
      platform: "linux",
      child,
      processLike,
      killTree
    });

    processLike.emit("SIGINT");

    expect(killTree).toHaveBeenCalledWith(4321);
    expect(processLike.exit).toHaveBeenCalledWith(130);
  });

  it("does not register SIGBREAK on Unix", () => {
    const processLike = new FakeProcess();
    const child = new FakeChild(4321);
    const killTree = vi.fn();

    registerChildShutdownHandlers({
      platform: "linux",
      child,
      processLike,
      killTree
    });

    // SIGBREAK is a Windows-only signal; the Unix branch should not listen
    // for it, so emitting it must not trigger a kill/exit.
    processLike.emit("SIGBREAK");

    expect(killTree).not.toHaveBeenCalled();
    expect(processLike.exit).not.toHaveBeenCalled();
  });

  it("kills the child on parent exit without calling processLike.exit again", () => {
    const processLike = new FakeProcess();
    const child = new FakeChild(2468);
    const killTree = vi.fn();

    registerChildShutdownHandlers({
      platform: "linux",
      child,
      processLike,
      killTree
    });

    processLike.emit("exit");

    expect(killTree).toHaveBeenCalledWith(2468);
    expect(processLike.exit).not.toHaveBeenCalled();
  });

  it("removes listeners when the child exits so the parent stays alive", () => {
    const processLike = new FakeProcess();
    const child = new FakeChild(1357);
    const killTree = vi.fn();

    registerChildShutdownHandlers({
      platform: "linux",
      child,
      processLike,
      killTree
    });

    child.emit("exit");
    processLike.emit("SIGINT");

    expect(killTree).not.toHaveBeenCalled();
    expect(processLike.exit).not.toHaveBeenCalled();
  });

  it("is a no-op when the child has no pid", () => {
    const processLike = new FakeProcess();
    const child = new FakeChild(undefined);
    const killTree = vi.fn();

    const cleanup = registerChildShutdownHandlers({
      platform: "linux",
      child,
      processLike,
      killTree
    });

    processLike.emit("SIGINT");

    expect(killTree).not.toHaveBeenCalled();
    expect(processLike.exit).not.toHaveBeenCalled();
    expect(typeof cleanup).toBe("function");
  });
});

describe("getTsxWatchCommand", () => {
  it("uses the repo-local tsx CLI through node", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");

    expect(getTsxWatchCommand(repoRoot, "entry.ts")).toEqual({
      command: process.execPath,
      args: [resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), "--watch", "entry.ts"]
    });
  });
});
