/**
 * The platform seam, `wasm-sandbox/workers.ts`.
 *
 * `wasm-sandbox-host.test.ts` drives the pool and the dispatcher over fake
 * workers, because a budget and a peak concurrency are host facts. These cover
 * the other half: the channel a real `worker_threads` thread speaks, the
 * pool's terminate-and-replace *with that thread*, and the browser factory,
 * whose `Worker` this runtime does not have and which is therefore stubbed —
 * the only worker here that is not real.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { importNodeBuiltin } from "@nodetool-ai/config";

import {
  createSandboxWasmDispatcher,
  resetSandboxWasmModuleCache,
  resetSandboxWasmWorkerPool,
  WasmWorkerPool
} from "../src/wasm-sandbox/host.js";
import {
  defaultWasmWorkerFactory,
  type WasmCallRequest,
  type WasmCallWorker,
  type WasmWorkerFactory
} from "../src/wasm-sandbox/workers.js";
import {
  referenceWasmModule,
  REFERENCE_SPECIFIER
} from "./fixtures/sandbox-wasm/cases.js";
import { referenceWasmBytes } from "./fixtures/sandbox-wasm/reference-bytes.js";

vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/config")>();
  return { ...actual, importNodeBuiltin: vi.fn(actual.importNodeBuiltin) };
});

/** Answer the next `create()` as a runtime without `node:worker_threads`. */
function withoutNodeWorkerThreads(): void {
  vi.mocked(importNodeBuiltin).mockResolvedValueOnce(null);
}

const compileReference = (): Promise<WebAssembly.Module> => {
  const bytes = referenceWasmBytes();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return WebAssembly.compile(buffer);
};

afterEach(() => {
  resetSandboxWasmWorkerPool();
  resetSandboxWasmModuleCache();
  vi.unstubAllGlobals();
});

/** One call as it goes over the wire to a worker. */
type PostedCall = { id: number; exportName: string; args: number[] };

/**
 * A stand-in for a `worker_threads` thread.
 *
 * Every other Node test here runs on a real one. This exists for the single
 * event a real thread will not raise on command: its own death.
 */
class StubNodeWorker {
  static instances: StubNodeWorker[] = [];
  private readonly handlers = new Map<string, ((payload: never) => void)[]>();
  readonly posted: PostedCall[] = [];
  terminated = 0;
  unreffed = 0;
  constructor() {
    StubNodeWorker.instances.push(this);
  }
  on(event: string, handler: (payload: never) => void): void {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }
  emit(event: string, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload as never);
  }
  postMessage(message: PostedCall): void {
    this.posted.push(message);
  }
  terminate(): Promise<number> {
    this.terminated += 1;
    return Promise.resolve(0);
  }
  unref(): void {
    this.unreffed += 1;
  }
}

// ---------------------------------------------------------------------------
// The Node channel, on a real thread
// ---------------------------------------------------------------------------

describe("the Node WASM worker channel", () => {
  it("reports a non-callable export as an error, not as a value", async () => {
    // The dispatcher never lets this through, so the worker's own check is
    // what answers. `mem` is the reference module's exported memory.
    const worker = await defaultWasmWorkerFactory.create();
    const module = await compileReference();
    await expect(worker.call({ module, exportName: "mem", args: [] })).rejects.toThrow(
      "WASM export mem is not callable"
    );
    // The channel is free again: the failed call left no pending slot behind.
    await expect(worker.call({ module, exportName: "add", args: [2, 40] })).resolves
      .toEqual({ value: 42 });
    worker.terminate();
  });

  it("serves one call at a time and refuses a second", async () => {
    const worker = await defaultWasmWorkerFactory.create();
    const module = await compileReference();
    const spinning = worker.call({ module, exportName: "spin", args: [] });
    await expect(worker.call({ module, exportName: "add", args: [1, 1] })).rejects.toThrow(
      "the WASM worker is already running a call"
    );
    worker.terminate();
    await expect(spinning).rejects.toThrow("exceeded its per-call timeout");
  });

  it("refuses every call after termination, and terminates only once", async () => {
    const worker = await defaultWasmWorkerFactory.create();
    const module = await compileReference();
    await expect(worker.call({ module, exportName: "add", args: [1, 1] })).resolves.toEqual({
      value: 2
    });
    worker.terminate();
    worker.terminate();
    await expect(worker.call({ module, exportName: "add", args: [1, 1] })).rejects.toThrow(
      "the WASM worker was terminated"
    );
  });

  it("fails the in-flight call when the thread dies, and never holds the process open", async () => {
    // A `worker_threads` "error" is a thread that crashed, which no fixture
    // can provoke from inside the worker body — every path there is caught and
    // reported as a reply. The thread is therefore stubbed, and the event
    // raised from the far side.
    StubNodeWorker.instances.length = 0;
    // The factory asks for the builtin, then `createNodeWorker` asks again.
    vi.mocked(importNodeBuiltin)
      .mockResolvedValueOnce({ Worker: StubNodeWorker })
      .mockResolvedValueOnce({ Worker: StubNodeWorker });

    const worker = await defaultWasmWorkerFactory.create();
    const stub = StubNodeWorker.instances[0];
    if (stub === undefined) throw new Error("expected a node worker");
    expect(stub.unreffed).toBe(1);
    const module = await compileReference();
    const call = worker.call({ module, exportName: "add", args: [1, 1] });
    stub.emit("error", new Error("the thread crashed"));
    await expect(call).rejects.toThrow("the thread crashed");
  });

  it("resolves undefined for a void export", async () => {
    const worker = await defaultWasmWorkerFactory.create();
    const module = await compileReference();
    await expect(worker.call({ module, exportName: "noop", args: [] })).resolves.toEqual({
      value: undefined
    });
    worker.terminate();
  });
});

// ---------------------------------------------------------------------------
// The pool, over real threads
// ---------------------------------------------------------------------------

/** The real factory, counting creations and terminations. */
class CountingFactory implements WasmWorkerFactory {
  created = 0;
  terminated = 0;
  /** Calls that reached a thread, so a test can wait for one to be running. */
  dispatched = 0;
  async create(): Promise<WasmCallWorker> {
    this.created += 1;
    const worker = await defaultWasmWorkerFactory.create();
    return {
      call: (request: WasmCallRequest) => {
        this.dispatched += 1;
        return worker.call(request);
      },
      terminate: () => {
        this.terminated += 1;
        worker.terminate();
      }
    };
  }
}

describe("the WASM worker pool over real threads", () => {
  it("terminates an overrunning worker and replaces it, and the replacement serves the next call", async () => {
    // A pool of one: the second call can only succeed on a worker created to
    // replace the killed one. A pool that terminates but never replaces looks
    // healthy until exactly here.
    const factory = new CountingFactory();
    const pool = new WasmWorkerPool(1, factory);
    // The per-call timeout also covers spawning the replacement worker, so it
    // needs headroom for a starved CI runner — 150 ms flaked there.
    const dispatcher = createSandboxWasmDispatcher(
      [referenceWasmModule({ limits: { callTimeoutMs: 2000 } })],
      { pool }
    );
    if (dispatcher === undefined) throw new Error("expected a dispatcher");

    await expect(dispatcher.call(REFERENCE_SPECIFIER, "spin", [])).rejects.toThrow(
      /exceeded its 2000 ms per-call timeout; the worker was terminated and replaced/
    );
    expect(pool.replacements).toBe(1);
    expect(factory.terminated).toBe(1);

    await expect(dispatcher.call(REFERENCE_SPECIFIER, "add", [20, 22])).resolves.toBe(42);
    expect(factory.created).toBe(2);
    pool.dispose();
  });

  it("cancels by terminating the thread, not by abandoning the promise", async () => {
    // `spin` has no yield point, so an abandoned promise would leave the
    // thread running to the end of its timeout. The thread has to die.
    const factory = new CountingFactory();
    const pool = new WasmWorkerPool(1, factory);
    const controller = new AbortController();
    const dispatcher = createSandboxWasmDispatcher(
      [referenceWasmModule({ limits: { callTimeoutMs: 5_000, wallClockMs: 10_000 } })],
      { pool, signal: controller.signal }
    );
    if (dispatcher === undefined) throw new Error("expected a dispatcher");

    const call = dispatcher.call(REFERENCE_SPECIFIER, "spin", []);
    // Abort once the call is on a thread, not after a fixed delay: worker
    // startup outruns any wall-clock guess on a loaded runner.
    while (factory.dispatched === 0) await new Promise(setImmediate);
    const startedAt = Date.now();
    controller.abort();
    await expect(call).rejects.toThrow("the run was cancelled");
    expect(factory.terminated).toBe(1);
    // The caller heard about it now, not after the 5 s per-call timeout.
    expect(Date.now() - startedAt).toBeLessThan(1_000);

    // The killed thread is not handed back to the pool: a further call runs on
    // a worker created to replace it.
    const controller2 = new AbortController();
    const next = createSandboxWasmDispatcher([referenceWasmModule()], {
      pool,
      signal: controller2.signal
    });
    await expect(next?.call(REFERENCE_SPECIFIER, "add", [1, 2])).resolves.toBe(3);
    expect(factory.created).toBe(2);
    pool.dispose();
  });
});

// ---------------------------------------------------------------------------
// The browser factory
// ---------------------------------------------------------------------------

type BrowserReply = { id: number; value?: number | null; error?: string };

/**
 * A stand-in for the browser's `Worker`.
 *
 * Node has no Web Worker, so this seam cannot be exercised on a real one here.
 * The fake holds the shape `createBrowserWorker` wires — `postMessage`,
 * `onmessage`, `onerror`, `terminate` — and the test drives it from the far
 * side.
 */
class StubBrowserWorker {
  static instances: StubBrowserWorker[] = [];
  onmessage: ((event: { data: BrowserReply }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  readonly posted: PostedCall[] = [];
  terminated = 0;
  constructor(readonly url: string) {
    StubBrowserWorker.instances.push(this);
  }
  postMessage(message: PostedCall): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated += 1;
  }
}

/** The one worker the next `create()` builds. */
async function createStubbedBrowserWorker(): Promise<{
  worker: WasmCallWorker;
  stub: StubBrowserWorker;
}> {
  StubBrowserWorker.instances.length = 0;
  vi.stubGlobal("Worker", StubBrowserWorker);
  withoutNodeWorkerThreads();
  const worker = await defaultWasmWorkerFactory.create();
  const stub = StubBrowserWorker.instances[0];
  if (stub === undefined) throw new Error("expected a browser worker");
  return { worker, stub };
}

describe("the browser WASM worker factory", () => {
  it("posts a call to a blob-URL worker and settles on its reply", async () => {
    const { worker, stub } = await createStubbedBrowserWorker();
    expect(stub.url).toMatch(/^blob:/);
    const module = await compileReference();

    const call = worker.call({ module, exportName: "add", args: [2, 40] });
    expect(stub.posted).toHaveLength(1);
    expect(stub.posted[0]?.exportName).toBe("add");
    expect(stub.posted[0]?.args).toEqual([2, 40]);
    stub.onmessage?.({ data: { id: stub.posted[0]?.id ?? 0, value: 42 } });
    await expect(call).resolves.toEqual({ value: 42 });

    // A reply with no call behind it is dropped rather than thrown on.
    expect(() => stub.onmessage?.({ data: { id: 99, value: 7 } })).not.toThrow();

    // A null value is the wire form of a void export.
    const voidCall = worker.call({ module, exportName: "noop", args: [] });
    stub.onmessage?.({ data: { id: 1, value: null } });
    await expect(voidCall).resolves.toEqual({ value: undefined });
  });

  it("rejects on an error reply and on a worker error, with a fallback message", async () => {
    const { worker, stub } = await createStubbedBrowserWorker();
    const module = await compileReference();

    const failing = worker.call({ module, exportName: "add", args: [1, 1] });
    stub.onmessage?.({ data: { id: 0, error: "unreachable" } });
    await expect(failing).rejects.toThrow("unreachable");

    const errored = worker.call({ module, exportName: "add", args: [1, 1] });
    stub.onerror?.({ message: "script load failed" });
    await expect(errored).rejects.toThrow("script load failed");

    const anonymous = worker.call({ module, exportName: "add", args: [1, 1] });
    stub.onerror?.({ message: "" });
    await expect(anonymous).rejects.toThrow("the WASM worker failed");
  });

  it("refuses a concurrent call, and every call after termination", async () => {
    const { worker, stub } = await createStubbedBrowserWorker();
    const module = await compileReference();

    const pending = worker.call({ module, exportName: "spin", args: [] });
    await expect(worker.call({ module, exportName: "add", args: [1, 1] })).rejects.toThrow(
      "the WASM worker is already running a call"
    );

    worker.terminate();
    expect(stub.terminated).toBe(1);
    await expect(pending).rejects.toThrow("exceeded its per-call timeout");

    worker.terminate();
    expect(stub.terminated).toBe(1);
    await expect(worker.call({ module, exportName: "add", args: [1, 1] })).rejects.toThrow(
      "the WASM worker was terminated"
    );
  });

  it("refuses to run at all in a runtime with neither worker implementation", async () => {
    withoutNodeWorkerThreads();
    await expect(defaultWasmWorkerFactory.create()).rejects.toThrow(
      "this runtime has no worker implementation, so WASM sandbox modules cannot run"
    );
  });
});
