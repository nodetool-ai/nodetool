import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import {
  getTsxWatchCommand,
  registerChildShutdownHandlers
} from "../../../scripts/child-shutdown.mjs";

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

  it("uses the repo-local tsx CLI through node", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");

    expect(getTsxWatchCommand(repoRoot, "entry.ts")).toEqual({
      command: process.execPath,
      args: [resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), "--watch", "entry.ts"]
    });
  });
});
