/**
 * Main-thread side of the off-thread QuickJS sandbox.
 *
 * It resolves the worker entry for whichever environment the process is in,
 * keeps a small warm pool, and serves every bridge call the guest makes as an
 * RPC over the port. Cancellation is `worker.terminate()`, immediately: it is
 * equally instant for a spinning guest and a parked one, and the logs and
 * emitted values already live in the main-thread accumulators — port FIFO
 * delivered every RPC the guest made before the abort. The deadline backstop
 * terminates a worker that answers nothing at all.
 *
 * This is the one module in `js-sandbox-worker/` that reaches for Node, and it
 * does so through `importNodeBuiltin`, so importing it off Node resolves
 * nothing and the caller falls back in-process.
 */

import { importNodeBuiltin } from "@nodetool-ai/config";

import {
  isWorkerToHostMessage,
  SANDBOX_DISPATCHER_BINDINGS,
  type HostToWorkerMessage,
  type ResultMessage,
  type RunMessage,
  type WorkerToHostMessage
} from "./protocol.js";

/** Workers alive at once. A fifth concurrent run waits for a free one. */
export const MAX_SANDBOX_WORKERS = 4;

/** Slack on top of the run's own budget before the backstop fires. */
export const DEADLINE_MARGIN_MS = 5_000;

// ---------------------------------------------------------------------------
// Entry resolution
// ---------------------------------------------------------------------------

export type WorkerEntry =
  | {
      /** A compiled entry: hand the file URL straight to `new Worker()`. */
      readonly kind: "file";
      readonly href: string;
    }
  | {
      /**
       * A TypeScript entry (tsx dev, vitest). The worker starts from an eval'd
       * bootstrap that registers tsx's transform and then imports the entry —
       * tsx's own `--import` hook deliberately skips worker threads, and
       * Node's built-in strip-only loader rejects the syntax the workspace
       * packages use, so the explicit `tsx/esm/api` registration is the one
       * path that works.
       */
      readonly kind: "bootstrap";
      readonly href: string;
      /** File URL of `tsx/esm/api`, resolved from this package. */
      readonly tsxApiHref: string;
      readonly execArgv: readonly string[];
    };

type NodeUrl = { pathToFileURL(path: string): URL; fileURLToPath(url: string | URL): string };
type NodeModule = { createRequire(from: string | URL): { resolve(id: string): string } };
type NodeFs = { existsSync(path: string): boolean };

/**
 * The worker entry for this environment, or `null` when there is none.
 *
 * Three shapes, decided by where this module itself was loaded from:
 *
 * | `import.meta.url` ends in | Entry | Mechanism |
 * |---|---|---|
 * | `.ts` (tsx, vitest) | sibling `worker-entry.ts` | explicit `execArgv` loading tsx |
 * | `.js` (compiled `dist/`) | sibling `worker-entry.js` | plain `new Worker(url)` |
 * | `server.mjs` (esbuild bundle) | `js-sandbox-worker/worker-entry.js` next to it | plain `new Worker(url)` |
 *
 * The `.ts` entry wins whenever this module is a `.ts` file, which is what
 * keeps a stale `dist/` from being loaded under tsx. `execArgv` is passed
 * explicitly rather than inherited: a vitest worker does not necessarily carry
 * the loader flags its parent was started with.
 */
export async function resolveWorkerEntry(): Promise<WorkerEntry | null> {
  const fs = await importNodeBuiltin<NodeFs>("node:fs");
  if (fs === null) return null;
  const url = await importNodeBuiltin<NodeUrl>("node:url");
  if (url === null) return null;

  const self = import.meta.url;
  const exists = (candidate: URL): boolean => {
    try {
      return fs.existsSync(url.fileURLToPath(candidate));
    } catch {
      return false;
    }
  };

  if (self.endsWith("server.mjs")) {
    const bundled = new URL("js-sandbox-worker/worker-entry.js", self);
    return exists(bundled) ? { kind: "file", href: bundled.href } : null;
  }

  if (self.endsWith(".ts")) {
    const source = new URL("worker-entry.ts", self);
    if (!exists(source)) return null;
    const tsxApiHref = await resolveTsxApi(url);
    if (tsxApiHref === null) return null;
    return {
      kind: "bootstrap",
      href: source.href,
      tsxApiHref,
      // `nodetool-dev` is what makes the workspace `exports` maps resolve to
      // source instead of `dist/`, the same condition the dev server runs
      // under. Passed explicitly: a vitest worker does not carry the flags its
      // parent was started with.
      execArgv: ["--conditions=nodetool-dev"]
    };
  }

  const compiled = new URL("worker-entry.js", self);
  return exists(compiled) ? { kind: "file", href: compiled.href } : null;
}

/**
 * Where `tsx/esm/api` lives, as a file URL.
 *
 * tsx is resolved from this package rather than assumed on the path, and a
 * resolution failure returns `null` so the caller falls back in-process
 * instead of spawning a worker that cannot parse its own entry.
 */
async function resolveTsxApi(url: NodeUrl): Promise<string | null> {
  const nodeModule = await importNodeBuiltin<NodeModule>("node:module");
  if (nodeModule === null) return null;
  try {
    const api = nodeModule.createRequire(import.meta.url).resolve("tsx/esm/api");
    return url.pathToFileURL(api).href;
  } catch {
    return null;
  }
}

/**
 * The eval'd bootstrap for a TypeScript entry. CJS on purpose: an eval worker
 * is CJS, and the two dynamic imports are what carry it into ESM.
 */
const TS_BOOTSTRAP = `
const { workerData } = require("node:worker_threads");
import(workerData.tsxApiHref)
  .then((tsx) => { tsx.register(); return import(workerData.entryHref); })
  .catch((error) => { throw error; });
`;

// ---------------------------------------------------------------------------
// Worker handles and the pool
// ---------------------------------------------------------------------------

/** The slice of a worker this module uses, so a test can supply a stub. */
export interface SandboxWorkerHandle {
  postMessage(message: HostToWorkerMessage): void;
  /** Route one message to the active run. Replaces any previous sink. */
  onMessage(handler: (message: WorkerToHostMessage) => void): void;
  /** Called when the thread dies — an `error` event or an unexpected `exit`. */
  onDeath(handler: (error: Error) => void): void;
  terminate(): void;
  /**
   * Hold and release the process for this worker. A leased worker refs, so a
   * run in flight cannot be cut short by the event loop draining; an idle
   * pooled worker unrefs, so a warm pool never keeps the process alive on its
   * own. Optional: a handle with no thread behind it has nothing to manage.
   */
  ref?(): void;
  unref?(): void;
}

export type SandboxWorkerFactory = () => Promise<SandboxWorkerHandle | null>;

type NodeWorkerInstance = {
  postMessage(message: unknown): void;
  on(event: string, handler: (payload: never) => void): void;
  terminate(): Promise<number> | void;
  ref(): void;
  unref(): void;
};

type NodeWorkerThreads = {
  Worker: new (
    entry: URL | string,
    options?: { execArgv?: string[]; eval?: boolean; workerData?: unknown }
  ) => NodeWorkerInstance;
};

/** Spawn a real `worker_threads` worker at the resolved entry. */
export const defaultSandboxWorkerFactory: SandboxWorkerFactory = async () => {
  const threads = await importNodeBuiltin<NodeWorkerThreads>("node:worker_threads");
  if (threads === null) return null;
  const entry = await resolveWorkerEntry();
  if (entry === null) return null;

  const worker =
    entry.kind === "file"
      ? new threads.Worker(new URL(entry.href), {})
      : new threads.Worker(TS_BOOTSTRAP, {
          eval: true,
          workerData: { tsxApiHref: entry.tsxApiHref, entryHref: entry.href },
          execArgv: [...entry.execArgv]
        });
  let sink: ((message: WorkerToHostMessage) => void) | undefined;
  let death: ((error: Error) => void) | undefined;
  let dead = false;
  const die = (error: Error): void => {
    if (dead) return;
    dead = true;
    death?.(error);
  };

  worker.on("message", (raw: never) => {
    if (isWorkerToHostMessage(raw)) sink?.(raw);
  });
  worker.on("error", (raw: never) => {
    const error: unknown = raw;
    die(error instanceof Error ? error : new Error(String(error)));
  });
  worker.on("exit", (code: never) => {
    die(new Error(`the sandbox worker exited with code ${String(code)}`));
  });

  // A pooled worker must never hold the process open on its own — and this has
  // to come *after* the listeners above. Attaching a `message` listener starts
  // the worker's public port, which re-refs it, so unreffing first is silently
  // undone: a CLI run that left a worker pooled then hung until its 45-minute
  // CI job timeout instead of exiting.
  worker.unref();

  return {
    postMessage: (message) => worker.postMessage(message),
    onMessage: (handler) => {
      sink = handler;
    },
    onDeath: (handler) => {
      death = handler;
      if (dead) handler(new Error("the sandbox worker is already dead"));
    },
    terminate: () => {
      dead = true;
      void worker.terminate();
    },
    ref: () => worker.ref(),
    unref: () => worker.unref()
  };
};

type Lease = {
  readonly handle: SandboxWorkerHandle;
  /** Return the worker to the pool, or drop it when the thread is gone. */
  release(discard: boolean): void;
};

/**
 * Warm workers, one run in flight each.
 *
 * Workers are spawned lazily up to the cap and reused after every run: a fresh
 * QuickJS engine costs a WASM instantiation, so the pool is what keeps a short
 * run short. A worker that was terminated is dropped rather than reused, and
 * the next acquire spawns its replacement.
 */
export class SandboxWorkerPool {
  private readonly idle: SandboxWorkerHandle[] = [];
  private readonly waiting: Array<(handle: SandboxWorkerHandle | null) => void> = [];
  private live = 0;

  constructor(
    private readonly factory: SandboxWorkerFactory = defaultSandboxWorkerFactory,
    private readonly max: number = MAX_SANDBOX_WORKERS
  ) {}

  async acquire(): Promise<Lease | null> {
    const handle = await this.take();
    if (handle === null) return null;
    // Leased: hold the process until the run gives it back.
    handle.ref?.();
    return {
      handle,
      release: (discard) => this.give(handle, discard)
    };
  }

  /** Terminate every idle worker. In-flight runs keep the ones they hold. */
  destroy(): void {
    while (this.idle.length > 0) {
      const handle = this.idle.pop();
      this.live--;
      handle?.terminate();
    }
  }

  private async take(): Promise<SandboxWorkerHandle | null> {
    const idle = this.idle.pop();
    if (idle !== undefined) return idle;
    if (this.live < this.max) {
      this.live++;
      let handle: SandboxWorkerHandle | null;
      try {
        // One spawn at a time. A burst of runs would otherwise start several
        // workers in parallel, and under tsx each spawn recompiles the whole
        // sandbox graph — four contending compiles turn a 500 ms warm-up into
        // several seconds. Serialized, the first worker comes up while the
        // rest of the burst queues behind it, then drains at per-run cost.
        this.spawnChain = this.spawnChain
          .catch(() => undefined)
          .then(() => this.factory());
        handle = await this.spawnChain;
      } catch {
        handle = null;
      }
      if (handle === null) this.live--;
      return handle;
    }
    return new Promise<SandboxWorkerHandle | null>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  private spawnChain: Promise<SandboxWorkerHandle | null> =
    Promise.resolve(null);

  private give(handle: SandboxWorkerHandle, discard: boolean): void {
    if (discard) {
      this.live--;
      handle.terminate();
      // A waiter must not be stranded behind a worker that no longer exists;
      // wake it so it spawns the replacement itself.
      const waiter = this.waiting.shift();
      if (waiter !== undefined) {
        this.live++;
        void this.factory()
          .then((replacement) => {
            if (replacement === null) this.live--;
            waiter(replacement);
          })
          .catch(() => {
            this.live--;
            waiter(null);
          });
      }
      return;
    }
    const waiter = this.waiting.shift();
    if (waiter !== undefined) {
      // Straight into the next run, so it stays leased and stays ref'd.
      waiter(handle);
      return;
    }
    // Idle again: stop holding the process open.
    handle.unref?.();
    this.idle.push(handle);
  }
}

let sharedPool: SandboxWorkerPool | undefined;

/** The process-wide pool. A test passes its own instead. */
export function defaultSandboxWorkerPool(): SandboxWorkerPool {
  if (sharedPool === undefined) sharedPool = new SandboxWorkerPool();
  return sharedPool;
}

// ---------------------------------------------------------------------------
// Running one program
// ---------------------------------------------------------------------------

export interface RunInWorkerOptions {
  /** The run payload, minus its `type` tag. */
  readonly run: Omit<RunMessage, "type">;
  /**
   * The main-side bridge table an RPC path is looked up in: the same record
   * `deriveBridgeShape` was given, plus the dispatchers and function globals.
   * A path resolves member by member and must land on a function.
   */
  readonly dispatch: Readonly<Record<string, unknown>>;
  readonly onLog: (line: string) => void;
  readonly onProgress: (percent: number, message?: string) => void;
  readonly signal?: AbortSignal;
  /** Suspended-time credit; pushed to the worker whenever it moves. */
  readonly suspendedMs?: () => number;
  /** Synchronous `stream.open` answer, re-read after every bridge call. */
  readonly isStreamOpen?: (handle: string) => boolean;
  readonly pool?: SandboxWorkerPool;
}

function failure(runId: string, error: unknown): ResultMessage {
  return {
    type: "result",
    runId,
    evalOk: false,
    errorName: error instanceof Error ? error.name : "Error",
    errorMessage: error instanceof Error ? error.message : String(error),
    failure: "worker"
  };
}

function cancelled(runId: string): ResultMessage {
  return {
    type: "result",
    runId,
    evalOk: false,
    errorName: "ExecutionCancelled",
    errorMessage: "Execution cancelled",
    failure: "cancelled"
  };
}

/**
 * Resolve an RPC path against the dispatch table and call it.
 *
 * The path is data from the worker, so every hop is checked: a path that does
 * not land on a function is an error the guest sees, not a host crash.
 */
async function dispatchRpc(
  table: Readonly<Record<string, unknown>>,
  path: readonly string[],
  args: readonly unknown[]
): Promise<unknown> {
  let current: unknown = table;
  for (const segment of path) {
    if (current === null || typeof current !== "object") {
      throw new Error(`no sandbox bridge at ${path.join(".")}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current !== "function") {
    throw new Error(`no sandbox bridge at ${path.join(".")}`);
  }
  return (current as (...a: unknown[]) => unknown)(...args);
}

/**
 * Run one guest program on a pooled worker and return how it settled.
 *
 * The result is always a `ResultMessage`: the guest's own outcome, a cancelled
 * result synthesized when the abort terminated the thread, or a failed result carrying
 * whatever killed the thread. The caller maps a `failure: "worker"` message
 * through `describeEngineFailure`. Returns `null` when no worker could be
 * acquired at all, which is the caller's signal to run in-process.
 */
export async function runInWorker(
  options: RunInWorkerOptions
): Promise<ResultMessage | null> {
  const pool = options.pool ?? defaultSandboxWorkerPool();
  const lease = await pool.acquire();
  if (lease === null) return null;

  const { handle } = lease;
  const runId = options.run.runId;
  const openHandles = Object.keys(options.run.streamOpenSeed ?? {});
  let closed = new Set(
    openHandles.filter((name) => options.run.streamOpenSeed?.[name] !== true)
  );
  let lastSuspendedMs = 0;
  let settled = false;
  let discard = false;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;

  return await new Promise<ResultMessage>((resolve) => {
    const settle = (result: ResultMessage, dropWorker: boolean): void => {
      if (settled) return;
      settled = true;
      discard = discard || dropWorker;
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      if (abortListener !== undefined) {
        options.signal?.removeEventListener("abort", abortListener);
      }
      handle.onMessage(() => {});
      handle.onDeath(() => {});
      lease.release(discard);
      resolve(result);
    };

    // Pushes that ride along with every reply: a suspend credit the interrupt
    // handler reads, and the close-only stream mirror. Both land while the
    // guest is parked on the RPC it just made.
    const pushSideChannels = (): void => {
      if (settled) return;
      if (options.suspendedMs !== undefined) {
        const suspendedMs = options.suspendedMs();
        if (suspendedMs !== lastSuspendedMs) {
          lastSuspendedMs = suspendedMs;
          handle.postMessage({ type: "suspend-update", runId, suspendedMs });
        }
      }
      if (options.isStreamOpen !== undefined) {
        for (const name of openHandles) {
          if (closed.has(name) || options.isStreamOpen(name)) continue;
          closed = new Set([...closed, name]);
          handle.postMessage({ type: "stream-closed", runId, handle: name });
        }
      }
    };

    handle.onDeath((error) => settle(failure(runId, error), true));

    handle.onMessage((message) => {
      if (settled) return;
      switch (message.type) {
        case "log":
          options.onLog(message.line);
          return;
        case "progress":
          options.onProgress(message.percent, message.message);
          return;
        case "result":
          settle(message, false);
          return;
        case "rpc": {
          const { id, path, args } = message;
          void (async () => {
            try {
              const value = await dispatchRpc(options.dispatch, path, args);
              if (settled) return;
              handle.postMessage({ type: "rpc-reply", id, ok: true, value });
            } catch (error) {
              if (settled) return;
              handle.postMessage({
                type: "rpc-reply",
                id,
                ok: false,
                name: error instanceof Error ? error.name : "Error",
                message: error instanceof Error ? error.message : String(error)
              });
            }
            pushSideChannels();
          })();
        }
      }
    });

    if (options.signal !== undefined) {
      abortListener = () => {
        if (settled) return;
        // Kill the thread. Nothing gentler is worth having: the logs and
        // emitted values already live in the main-thread accumulators (port
        // FIFO delivered every RPC the guest made before this), a cancelled
        // action leaving no partial `state` mutation is the cleaner contract,
        // and `terminate()` is equally instant for a guest that spins and one
        // that awaits. The pool replaces the worker lazily.
        settle(cancelled(runId), true);
      };
      if (options.signal.aborted) {
        abortListener();
      } else {
        options.signal.addEventListener("abort", abortListener, { once: true });
      }
    }

    // Backstop for a worker that answers nothing at all — a wedged thread never
    // reaches its own deadline, so the main thread keeps one of its own.
    //
    // The suspend allowance only widens it when the run can actually suspend,
    // the way the engine's own abort is sized in `js-sandbox.ts` and
    // `interpreter.ts`. Adding it unconditionally put a ~30 minute floor
    // (`DEFAULT_SUSPEND_ALLOWANCE_MS`) under every run, so a wedged worker —
    // a guest that OOMs marshaling a host value, say — outlived its
    // `timeoutMs` by half an hour instead of failing.
    const backstop =
      options.run.timeoutMs +
      (options.run.hasClock ? Math.max(0, options.run.suspendAllowanceMs) : 0) +
      DEADLINE_MARGIN_MS;
    deadlineTimer = setTimeout(() => {
      settle(
        failure(
          runId,
          new Error(
            `the sandbox worker did not answer within ${backstop} ms and was terminated`
          )
        ),
        true
      );
    }, backstop);

    try {
      handle.postMessage({ type: "run", ...options.run });
    } catch (error) {
      // A `DataCloneError` here is the pre-scan having missed something; the
      // worker never started, so the thread is still reusable.
      settle(failure(runId, error), false);
    }
  });
}

/** Guest binding names for the dispatchers, re-exported for the caller. */
export { SANDBOX_DISPATCHER_BINDINGS };
