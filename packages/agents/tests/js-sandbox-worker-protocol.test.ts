import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SandboxWorkerPool,
  runInWorker,
  type SandboxWorkerHandle
} from "../src/js-sandbox-worker/host.js";
import { resolveSandboxLimits } from "../src/js-sandbox.js";
import {
  deriveBridgeShape,
  interpreterResultMessage,
  isHostToWorkerMessage,
  isWorkerToHostMessage,
  precheckCloneSafety,
  type HostToWorkerMessage,
  type RunMessage,
  type WorkerToHostMessage
} from "../src/js-sandbox-worker/protocol.js";
import { toGuestBytes } from "../src/sandbox-bytes.js";

// ---------------------------------------------------------------------------
// Bridge shape
// ---------------------------------------------------------------------------

describe("deriveBridgeShape", () => {
  it("splits functions, member tables, plain values, dispatchers and globals", () => {
    const shape = deriveBridgeShape({
      bridges: {
        fetch: async () => undefined,
        sleep: async () => undefined,
        workspace: { read: async () => "", write: async () => undefined },
        __maxIter: 1000,
        __secretScope: ["OPENAI_API_KEY"]
      },
      dispatchers: ["capability", "wasm"],
      globals: { __callTool: () => undefined, state: { count: 1 } }
    });

    expect(shape.flat).toEqual(["fetch", "sleep"]);
    expect(shape.objects).toEqual({ workspace: ["read", "write"] });
    expect(shape.values).toEqual({
      __maxIter: 1000,
      __secretScope: ["OPENAI_API_KEY"]
    });
    // Declared order is normalized, so two derivations of one table compare equal.
    expect(shape.dispatchers).toEqual(["wasm", "capability"]);
    expect(shape.globals).toEqual({
      __callTool: { kind: "fn" },
      state: { kind: "value", value: { count: 1 } }
    });
  });

  it("treats a mixed object as a value rather than a member table", () => {
    const shape = deriveBridgeShape({
      bridges: { limits: { max: 5, check: () => true } }
    });
    expect(shape.objects).toEqual({});
    expect(Object.keys(shape.values)).toEqual(["limits"]);
  });
});

// ---------------------------------------------------------------------------
// Clone safety
// ---------------------------------------------------------------------------

describe("precheckCloneSafety", () => {
  it("accepts plain data, top-level functions, bytes and tagged bytes", () => {
    const verdict = precheckCloneSafety({
      __callTool: () => undefined,
      state: { count: 1, items: ["a", null], nested: { at: new Date(0) } },
      bytes: new Uint8Array([1, 2, 3]),
      tagged: toGuestBytes(new Uint8Array([4, 5])),
      lookup: new Map([["k", 1]])
    });
    expect(verdict).toEqual({ ok: true });
  });

  it("accepts a cycle, which a structured clone preserves", () => {
    const state: Record<string, unknown> = { name: "root" };
    state.self = state;
    expect(precheckCloneSafety({ state }).ok).toBe(true);
  });

  it("rejects a nested function, naming the path", () => {
    const verdict = precheckCloneSafety({ state: { hooks: { onDone: () => 1 } } });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toContain("globals.state.hooks.onDone");
    expect(verdict.reason).toContain("function");
  });

  it("rejects a class instance, whose prototype the clone would drop", () => {
    class Recorder {
      readonly entries: string[] = [];
      record(line: string): void {
        this.entries.push(line);
      }
    }
    const verdict = precheckCloneSafety({ state: { recorder: new Recorder() } });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toContain("Recorder");
  });
});

// ---------------------------------------------------------------------------
// Message round trip
// ---------------------------------------------------------------------------

describe("message round trip", () => {
  const run: RunMessage = {
    type: "run",
    runId: "run-1",
    code: "return 1;",
    timeoutMs: 30_000,
    limits: resolveSandboxLimits({ maxFetchCalls: 20 }),
    suspendAllowanceMs: 1_800_000,
    hasClock: true,
    engineTimeoutMs: 60_000,
    capabilityFacades: new Map([["@nodetool-ai/sandbox-nodetool/web", "export {}"]]),
    streamOpenSeed: { input: true },
    bridgeShape: deriveBridgeShape({
      bridges: { fetch: async () => undefined, workspace: { read: async () => "" } },
      dispatchers: ["host"],
      globals: { state: { count: 0 } }
    })
  };

  it("survives a structured clone in both directions", () => {
    const cloned = structuredClone(run) as HostToWorkerMessage;
    expect(isHostToWorkerMessage(cloned)).toBe(true);
    expect(cloned).toEqual(run);

    const result: WorkerToHostMessage = {
      type: "result",
      runId: "run-1",
      evalOk: true,
      data: { bytes: new Uint8Array([1, 2]) },
      syncedGlobals: { state: { count: 2 } }
    };
    const back = structuredClone(result) as WorkerToHostMessage;
    expect(isWorkerToHostMessage(back)).toBe(true);
    expect(back).toEqual(result);
  });

  it("flattens an interpreter outcome onto the wire, both branches", () => {
    const ok = interpreterResultMessage("run-1", {
      ok: true,
      data: { answer: 42 },
      syncedGlobals: { state: { count: 2 } }
    });
    expect(ok).toEqual({
      type: "result",
      runId: "run-1",
      evalOk: true,
      data: { answer: 42 },
      syncedGlobals: { state: { count: 2 } }
    });

    // The extractor runs even when the guest failed, so the write-back rides
    // on the error branch too.
    const failed = interpreterResultMessage("run-2", {
      ok: false,
      error: { name: "TypeError", message: "x is not a function", stack: "at <eval>" },
      syncedGlobals: { state: { count: 1 } }
    });
    expect(failed).toEqual({
      type: "result",
      runId: "run-2",
      evalOk: false,
      errorName: "TypeError",
      errorMessage: "x is not a function",
      errorStack: "at <eval>",
      syncedGlobals: { state: { count: 1 } }
    });

    // Absent fields are omitted, not sent as undefined.
    expect(
      Object.keys(
        interpreterResultMessage("run-3", { ok: false, error: { name: "E", message: "m" } })
      ).sort()
    ).toEqual(["errorMessage", "errorName", "evalOk", "runId", "type"]);
  });

  it("rejects a foreign payload", () => {
    expect(isWorkerToHostMessage({ type: "abort", runId: "x" })).toBe(false);
    expect(isHostToWorkerMessage({ type: "rpc", id: 0, path: [], args: [] })).toBe(false);
    expect(isWorkerToHostMessage(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Host, against a fake worker
// ---------------------------------------------------------------------------

/** A worker stand-in whose "thread" is a set of callbacks the test drives. */
class FakeWorker implements SandboxWorkerHandle {
  readonly received: HostToWorkerMessage[] = [];
  terminated = 0;
  /** Every ref/unref the pool asked for, in order. */
  readonly refLog: ("ref" | "unref")[] = [];
  private sink: ((message: WorkerToHostMessage) => void) | undefined;
  private death: ((error: Error) => void) | undefined;
  private announceStart: (() => void) | undefined;
  /** Resolves once the run message lands, which is when the handlers exist. */
  readonly started = new Promise<void>((resolve) => {
    this.announceStart = resolve;
  });

  postMessage(message: HostToWorkerMessage): void {
    this.received.push(message);
    if (message.type === "run") this.announceStart?.();
  }
  onMessage(handler: (message: WorkerToHostMessage) => void): void {
    this.sink = handler;
  }
  onDeath(handler: (error: Error) => void): void {
    this.death = handler;
  }
  terminate(): void {
    this.terminated++;
  }
  ref(): void {
    this.refLog.push("ref");
  }
  unref(): void {
    this.refLog.push("unref");
  }

  /** Speak as the worker. */
  send(message: WorkerToHostMessage): void {
    this.sink?.(message);
  }
  die(error: Error): void {
    this.death?.(error);
  }
  typesReceived(): string[] {
    return this.received.map((m) => m.type);
  }
}

function poolOf(worker: FakeWorker): SandboxWorkerPool {
  return new SandboxWorkerPool(async () => worker, 1);
}

const baseRun: Omit<RunMessage, "type"> = {
  runId: "run-1",
  code: "return 1;",
  timeoutMs: 1_000,
  limits: resolveSandboxLimits({}),
  suspendAllowanceMs: 0,
  hasClock: false,
  engineTimeoutMs: 1_000,
  streamOpenSeed: null,
  bridgeShape: deriveBridgeShape({ bridges: {} })
};

afterEach(() => {
  vi.useRealTimers();
});

describe("runInWorker", () => {
  it("serves an RPC by path and replies with the value", async () => {
    const worker = new FakeWorker();
    const read = vi.fn(async (path: string) => `contents of ${path}`);
    const settled = runInWorker({
      run: baseRun,
      dispatch: { workspace: { read } },
      onLog: () => {},
      onProgress: () => {},
      pool: poolOf(worker)
    });

    await worker.started;

    worker.send({ type: "rpc", id: 7, path: ["workspace", "read"], args: ["a.txt"] });
    await vi.waitFor(() => expect(worker.received.length).toBe(2));
    expect(worker.received[1]).toEqual({
      type: "rpc-reply",
      id: 7,
      ok: true,
      value: "contents of a.txt"
    });
    expect(read).toHaveBeenCalledWith("a.txt");

    worker.send({ type: "result", runId: "run-1", evalOk: true, data: 1 });
    expect(await settled).toMatchObject({ evalOk: true, data: 1 });
  });

  it("maps a thrown bridge error onto a failed reply", async () => {
    const worker = new FakeWorker();
    const settled = runInWorker({
      run: baseRun,
      dispatch: {
        fetch: async () => {
          const error = new Error("blocked by the SSRF guard");
          error.name = "SecurityError";
          throw error;
        }
      },
      onLog: () => {},
      onProgress: () => {},
      pool: poolOf(worker)
    });

    await worker.started;

    worker.send({ type: "rpc", id: 1, path: ["fetch"], args: ["http://127.0.0.1"] });
    await vi.waitFor(() => expect(worker.received.length).toBe(2));
    expect(worker.received[1]).toEqual({
      type: "rpc-reply",
      id: 1,
      ok: false,
      name: "SecurityError",
      message: "blocked by the SSRF guard"
    });

    worker.send({ type: "result", runId: "run-1", evalOk: true });
    await settled;
  });

  it("refuses a path that lands on nothing callable", async () => {
    const worker = new FakeWorker();
    const settled = runInWorker({
      run: baseRun,
      dispatch: { workspace: { read: async () => "" } },
      onLog: () => {},
      onProgress: () => {},
      pool: poolOf(worker)
    });

    await worker.started;

    worker.send({ type: "rpc", id: 2, path: ["workspace", "chmod"], args: [] });
    await vi.waitFor(() => expect(worker.received.length).toBe(2));
    expect(worker.received[1]).toMatchObject({
      ok: false,
      message: "no sandbox bridge at workspace.chmod"
    });

    worker.send({ type: "result", runId: "run-1", evalOk: true });
    await settled;
  });

  it("forwards log and progress pushes", async () => {
    const worker = new FakeWorker();
    const logs: string[] = [];
    const progress: Array<[number, string | undefined]> = [];
    const settled = runInWorker({
      run: baseRun,
      dispatch: {},
      onLog: (line) => logs.push(line),
      onProgress: (percent, message) => progress.push([percent, message]),
      pool: poolOf(worker)
    });

    await worker.started;

    worker.send({ type: "log", line: "hello" });
    worker.send({ type: "progress", percent: 40, message: "halfway" });
    worker.send({ type: "result", runId: "run-1", evalOk: true });
    await settled;

    expect(logs).toEqual(["hello"]);
    expect(progress).toEqual([[40, "halfway"]]);
  });

  it("pushes suspend credit and stream closure after a bridge call", async () => {
    const worker = new FakeWorker();
    let suspended = 0;
    const open = new Map([["input", true]]);
    const settled = runInWorker({
      run: { ...baseRun, streamOpenSeed: { input: true } },
      dispatch: {
        __takeInput: async () => {
          suspended = 250;
          open.set("input", false);
          return null;
        }
      },
      onLog: () => {},
      onProgress: () => {},
      suspendedMs: () => suspended,
      isStreamOpen: (handle) => open.get(handle) === true,
      pool: poolOf(worker)
    });

    await worker.started;

    worker.send({ type: "rpc", id: 1, path: ["__takeInput"], args: ["input"] });
    await vi.waitFor(() => expect(worker.received.length).toBe(4));
    expect(worker.typesReceived()).toEqual([
      "run",
      "rpc-reply",
      "suspend-update",
      "stream-closed"
    ]);

    worker.send({ type: "result", runId: "run-1", evalOk: true });
    await settled;
  });

  it("terminates the worker immediately on abort", async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const settled = runInWorker({
      run: baseRun,
      dispatch: {},
      onLog: () => {},
      onProgress: () => {},
      signal: controller.signal,
      pool: poolOf(worker)
    });

    await worker.started;

    controller.abort();
    // No grace, no abort message: terminate() is equally instant for a
    // spinning guest and a parked one, and the logs already live host-side.
    expect(worker.typesReceived()).toEqual(["run"]);
    expect(worker.terminated).toBe(1);
    expect(await settled).toMatchObject({
      evalOk: false,
      errorName: "ExecutionCancelled",
      failure: "cancelled"
    });
  });

  it("terminates a worker that never answers, on the deadline backstop", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const settled = runInWorker({
      run: { ...baseRun, timeoutMs: 1_000, suspendAllowanceMs: 500 },
      dispatch: {},
      onLog: () => {},
      onProgress: () => {},
      pool: poolOf(worker)
    });

    await vi.advanceTimersByTimeAsync(1_000 + 500 + 5_000);
    expect(worker.terminated).toBe(1);
    expect(await settled).toMatchObject({ evalOk: false, failure: "worker" });
  });

  it("reports a dead worker as a failed result", async () => {
    const worker = new FakeWorker();
    const settled = runInWorker({
      run: baseRun,
      dispatch: {},
      onLog: () => {},
      onProgress: () => {},
      pool: poolOf(worker)
    });

    await worker.started;

    worker.die(new Error("Aborted(). Build with -sASSERTIONS for more info."));
    expect(await settled).toMatchObject({
      evalOk: false,
      failure: "worker",
      errorMessage: "Aborted(). Build with -sASSERTIONS for more info."
    });
  });

  it("falls back when no worker can be spawned", async () => {
    const outcome = await runInWorker({
      run: baseRun,
      dispatch: {},
      onLog: () => {},
      onProgress: () => {},
      pool: new SandboxWorkerPool(async () => null, 1)
    });
    expect(outcome).toBeNull();
  });
});

describe("SandboxWorkerPool", () => {
  it("reuses a released worker and replaces a discarded one", async () => {
    let spawned = 0;
    const pool = new SandboxWorkerPool(async () => {
      spawned++;
      return new FakeWorker();
    }, 1);

    const first = await pool.acquire();
    expect(first).not.toBeNull();
    first?.release(false);

    const second = await pool.acquire();
    expect(spawned).toBe(1);
    expect(second?.handle).toBe(first?.handle);
    second?.release(true);

    const third = await pool.acquire();
    expect(spawned).toBe(2);
    expect(third?.handle).not.toBe(first?.handle);
    third?.release(false);
    pool.destroy();
  });

  it("makes a second run wait for the one worker", async () => {
    const pool = new SandboxWorkerPool(async () => new FakeWorker(), 1);
    const first = await pool.acquire();
    let secondResolved = false;
    const second = pool.acquire().then((lease) => {
      secondResolved = true;
      return lease;
    });

    await Promise.resolve();
    expect(secondResolved).toBe(false);

    first?.release(false);
    expect((await second)?.handle).toBe(first?.handle);
    pool.destroy();
  });

  // A warm pool that stays ref'd keeps the process alive forever: the CLI's
  // app-build leg ran its cases in under a second and then sat until its
  // 45-minute CI job timeout. Ref'ing only for the lease is what lets the
  // process exit while still keeping a run in flight from being cut short.
  it("holds the process only while a worker is leased", async () => {
    const worker = new FakeWorker();
    const pool = poolOf(worker);

    const first = await pool.acquire();
    expect(worker.refLog).toEqual(["ref"]);

    first?.release(false);
    expect(worker.refLog).toEqual(["ref", "unref"]);

    const second = await pool.acquire();
    expect(worker.refLog).toEqual(["ref", "unref", "ref"]);
    second?.release(false);
    pool.destroy();
  });

  it("keeps a worker ref'd when it passes straight to a waiting run", async () => {
    const worker = new FakeWorker();
    const pool = poolOf(worker);

    const first = await pool.acquire();
    const second = pool.acquire();
    first?.release(false);
    await second;

    // Handed over without ever going idle, so it must not have been unref'd.
    expect(worker.refLog).toEqual(["ref", "ref"]);
    pool.destroy();
  });
});
