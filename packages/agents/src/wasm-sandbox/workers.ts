/**
 * The platform seam for running one WASM call off the host thread.
 *
 * A call has to be killable: the scalar contract lets a pack export an
 * infinite loop, and nothing short of destroying the thread stops one. Node
 * gets `worker_threads`, a browser gets a Web Worker, and the rest of the host
 * (`./host.ts`) knows neither — it asks a {@link WasmWorkerFactory} for a
 * worker and terminates it when a call overruns.
 *
 * Both workers are created from an inline source string rather than a file
 * URL. A separate entry file would have to survive `tsx`, vitest, the compiled
 * `dist/`, and the esbuild backend bundle, each of which resolves it
 * differently; the source is eleven lines, so it travels with the caller
 * instead.
 *
 * `WebAssembly.Module` is structured-cloneable, so the compiled module crosses
 * to the worker without being recompiled there.
 */

import { importNodeBuiltin } from "@nodetool-ai/config";

export interface WasmCallRequest {
  readonly module: WebAssembly.Module;
  readonly exportName: string;
  readonly args: readonly number[];
}

/** One worker, serving one call at a time. */
export interface WasmCallWorker {
  /** Instantiate fresh, call, discard. Rejects if the guest export throws. */
  call(request: WasmCallRequest): Promise<{ value: number | undefined }>;
  /** Destroy the thread. Any in-flight call rejects. */
  terminate(): void;
}

export interface WasmWorkerFactory {
  create(): Promise<WasmCallWorker>;
}

/**
 * The worker body, as an expression over `receive` and `send`.
 *
 * A fresh `WebAssembly.Instance` per message is the instance-per-call rule:
 * mutable globals and linear memory start at their declared initial values
 * every time, and a terminated worker therefore destroys nothing the
 * invocation owned.
 */
const WORKER_BODY = `function (receive, send) {
  receive(function (message) {
    try {
      var instance = new WebAssembly.Instance(message.module, {});
      var exported = instance.exports[message.exportName];
      if (typeof exported !== "function") {
        send({ id: message.id, error: "WASM export " + message.exportName + " is not callable" });
        return;
      }
      var value = exported.apply(null, message.args);
      send({ id: message.id, value: value === undefined ? null : value });
    } catch (error) {
      send({ id: message.id, error: (error && error.message) ? String(error.message) : String(error) });
    }
  });
}`;

const NODE_WORKER_SOURCE = `const { parentPort } = require("node:worker_threads");
(${WORKER_BODY})(
  (handler) => parentPort.on("message", handler),
  (reply) => parentPort.postMessage(reply)
);
`;

const BROWSER_WORKER_SOURCE = `(${WORKER_BODY})(
  (handler) => { self.onmessage = (event) => handler(event.data); },
  (reply) => self.postMessage(reply)
);
`;

type Pending = {
  readonly resolve: (result: { value: number | undefined }) => void;
  readonly reject: (error: Error) => void;
};

/** Shared plumbing: one outstanding call, correlated by id, settled once. */
class ChannelWorker implements WasmCallWorker {
  private pending: Pending | undefined;
  private nextId = 0;
  private dead = false;

  constructor(
    private readonly post: (message: unknown, transfer?: unknown) => void,
    private readonly kill: () => void
  ) {}

  receive(reply: { id: number; value?: number | null; error?: string }): void {
    const pending = this.pending;
    if (pending === undefined) return;
    this.pending = undefined;
    if (typeof reply.error === "string") {
      pending.reject(new Error(reply.error));
      return;
    }
    pending.resolve({ value: reply.value === null ? undefined : reply.value });
  }

  fail(error: Error): void {
    const pending = this.pending;
    this.pending = undefined;
    pending?.reject(error);
  }

  call(request: WasmCallRequest): Promise<{ value: number | undefined }> {
    if (this.dead) return Promise.reject(new Error("the WASM worker was terminated"));
    if (this.pending !== undefined) {
      return Promise.reject(new Error("the WASM worker is already running a call"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.post({
        id,
        module: request.module,
        exportName: request.exportName,
        args: [...request.args]
      });
    });
  }

  terminate(): void {
    if (this.dead) return;
    this.dead = true;
    this.kill();
    this.fail(new Error("the WASM call exceeded its per-call timeout"));
  }
}

type NodeWorkerThreads = {
  Worker: new (source: string, options: { eval: boolean }) => {
    on(event: string, handler: (payload: never) => void): void;
    postMessage(message: unknown): void;
    terminate(): Promise<number>;
    unref(): void;
  };
};

async function createNodeWorker(): Promise<WasmCallWorker> {
  const threads = await importNodeBuiltin<NodeWorkerThreads>("node:worker_threads");
  if (threads === null) {
    throw new Error("node:worker_threads is unavailable, so WASM sandbox modules cannot run");
  }
  const worker = new threads.Worker(NODE_WORKER_SOURCE, { eval: true });
  const channel = new ChannelWorker(
    (message) => worker.postMessage(message),
    () => void worker.terminate()
  );
  worker.on("message", (reply: { id: number; value?: number | null; error?: string }) =>
    channel.receive(reply)
  );
  worker.on("error", (error: Error) => channel.fail(error));
  // A pooled worker must never hold the process open on its own — and this has
  // to come *after* the listeners above, which re-ref the worker's public port.
  worker.unref();
  return channel;
}

async function createBrowserWorker(): Promise<WasmCallWorker> {
  const url = URL.createObjectURL(
    new Blob([BROWSER_WORKER_SOURCE], { type: "text/javascript" })
  );
  const worker = new Worker(url);
  const channel = new ChannelWorker(
    (message) => worker.postMessage(message),
    () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
  );
  worker.onmessage = (event: MessageEvent) =>
    channel.receive(event.data as { id: number; value?: number | null; error?: string });
  worker.onerror = (event: ErrorEvent) =>
    channel.fail(new Error(event.message || "the WASM worker failed"));
  return channel;
}

const hasWebWorkers = (): boolean =>
  typeof Worker !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined";

/**
 * The factory for the current runtime.
 *
 * Node is preferred when both look available, because an Electron renderer has
 * both and `worker_threads` is the path the rest of the host is exercised on.
 */
export const defaultWasmWorkerFactory: WasmWorkerFactory = {
  async create() {
    const threads = await importNodeBuiltin<NodeWorkerThreads>("node:worker_threads");
    if (threads !== null) return createNodeWorker();
    if (hasWebWorkers()) return createBrowserWorker();
    throw new Error("this runtime has no worker implementation, so WASM sandbox modules cannot run");
  }
};
