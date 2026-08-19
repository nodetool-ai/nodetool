/**
 * The host side of sandbox WASM modules: compile once, run on a pooled worker,
 * one fresh instance per call, under layered budgets.
 *
 * Three things live here, in widening scope:
 *
 * - a **module cache** keyed by content digest, process-wide. Compilation is
 *   the expensive part and `WebAssembly.Module` is structured-cloneable, so one
 *   compile serves every call in every invocation, on any worker.
 * - a **worker pool**, process-wide, four workers by default. A call that
 *   overruns its per-call timeout terminates its worker and the pool creates a
 *   replacement. That is safe precisely because instances are per-call: the
 *   killed thread owned nothing.
 * - a **dispatcher**, one per run. It is the security boundary: it serves only
 *   the WASM modules declared for that run, and validates module identity,
 *   export allowlist, argument count, and argument type before any worker sees
 *   the call. Guest code that gets hold of a dispatcher gains nothing beyond
 *   the run's own declared surface.
 *
 * **Stateless by contract.** Each call instantiates fresh from the cached
 * module, runs, and discards the instance. Mutable globals and linear memory
 * do not carry from one call to the next — a pack that needs state across
 * calls keeps it in guest JavaScript and passes scalars in.
 */

import {
  parseWasmBinary,
  SANDBOX_WASM_BUDGETS,
  WASM_VALUE_TYPE,
  wasmValueTypeName,
  type ResolvedSandboxModule,
  type SandboxWasmContract,
  type SandboxWasmLimits,
  type WasmSignature
} from "@nodetool-ai/protocol";

import {
  defaultWasmWorkerFactory,
  type WasmCallWorker,
  type WasmWorkerFactory
} from "./workers.js";
import { isNumber, isString } from "../utils/type-guards.js";

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

/** Raised when a call breaks the scalar contract or exhausts a budget. */
export class SandboxWasmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxWasmError";
  }
}

// ---------------------------------------------------------------------------
// Compile-once module cache
// ---------------------------------------------------------------------------

const moduleCache = new Map<string, Promise<WebAssembly.Module>>();

/** Compile a module's bytes at most once per process, keyed by content digest. */
export function compileSandboxWasm(
  contentDigest: string,
  bytes: Uint8Array
): Promise<WebAssembly.Module> {
  const cached = moduleCache.get(contentDigest);
  if (cached !== undefined) return cached;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const compiled = WebAssembly.compile(buffer);
  moduleCache.set(contentDigest, compiled);
  // A compile that fails must not poison the cache for the next run.
  void compiled.catch(() => moduleCache.delete(contentDigest));
  return compiled;
}

/** Drop the compile cache. Tests only. */
export function resetSandboxWasmModuleCache(): void {
  moduleCache.clear();
}

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

interface PooledWorker {
  worker: WasmCallWorker;
  /** Set when the worker was killed mid-call, so it is never reused. */
  dead: boolean;
}

/** The one error a cancelled run raises, wherever it is noticed. */
function cancelled(): SandboxWasmError {
  return new SandboxWasmError("the run was cancelled");
}

/**
 * Read the abort flag through a call.
 *
 * The point of these checks is that the answer changes across an await, which
 * is exactly what narrowing an inline `signal.aborted` would deny.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** A fixed set of workers shared by every invocation in the process. */
export class WasmWorkerPool {
  private readonly idle: PooledWorker[] = [];
  private readonly waiting: ((slot: PooledWorker | undefined) => void)[] = [];
  private live = 0;
  /** Workers terminated for overrunning a per-call timeout. Observable in tests. */
  replacements = 0;

  constructor(
    private readonly size: number = SANDBOX_WASM_BUDGETS.workerPoolSize,
    private readonly factory: WasmWorkerFactory = defaultWasmWorkerFactory
  ) {}

  private async acquire(): Promise<PooledWorker> {
    const idle = this.idle.pop();
    if (idle !== undefined) return idle;
    if (this.live < this.size) {
      this.live += 1;
      try {
        return { worker: await this.factory.create(), dead: false };
      } catch (error) {
        this.live -= 1;
        throw error;
      }
    }
    const slot = await new Promise<PooledWorker | undefined>((resolve) => {
      this.waiting.push(resolve);
    });
    if (slot !== undefined) return slot;
    this.live += 1;
    try {
      return { worker: await this.factory.create(), dead: false };
    } catch (error) {
      this.live -= 1;
      throw error;
    }
  }

  private release(slot: PooledWorker): void {
    if (slot.dead) {
      this.live -= 1;
      const next = this.waiting.shift();
      // Hand the vacancy on, not the corpse: the next waiter creates a
      // replacement worker for the slot the killed one gave up.
      if (next !== undefined) next(undefined);
      return;
    }
    const next = this.waiting.shift();
    if (next !== undefined) {
      next(slot);
      return;
    }
    this.idle.push(slot);
  }

  /**
   * Run one call, killing and replacing the worker if it overruns or is
   * cancelled.
   *
   * Cancellation has to reach the worker, not just the caller. A guest export
   * is a scalar function with no yield point, so abandoning the promise would
   * leave the thread spinning for the whole timeout on work nobody wants —
   * the same reason a timeout terminates rather than waits.
   */
  async run(
    module: WebAssembly.Module,
    exportName: string,
    args: readonly number[],
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<number | undefined> {
    if (isAborted(signal)) throw cancelled();
    const slot = await this.acquire();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      if (isAborted(signal)) throw cancelled();
      const cancellation = new Promise<never>((_resolve, reject) => {
        if (signal === undefined) return;
        onAbort = () => {
          slot.dead = true;
          // Reject before terminating, for the reason the timeout does: the
          // worker's own rejection would otherwise win the race and report a
          // generic message instead of the cancellation.
          reject(cancelled());
          slot.worker.terminate();
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          slot.dead = true;
          this.replacements += 1;
          // Reject before terminating: a terminated worker rejects its own
          // pending call, and the race would then report the worker's generic
          // message instead of the budget this call actually broke.
          reject(
            new SandboxWasmError(
              `WASM call ${exportName} exceeded its ${timeoutMs} ms per-call timeout; the worker was terminated and replaced`
            )
          );
          slot.worker.terminate();
        }, timeoutMs);
      });
      const result = await Promise.race([
        slot.worker.call({ module, exportName, args }),
        timeout,
        cancellation
      ]);
      return result.value;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (onAbort !== undefined) signal?.removeEventListener("abort", onAbort);
      this.release(slot);
    }
  }

  /** Destroy every worker. Tests and host shutdown. */
  dispose(): void {
    for (const slot of this.idle) slot.worker.terminate();
    this.idle.length = 0;
    this.live = 0;
    for (const waiter of this.waiting.splice(0)) waiter(undefined);
  }
}

let sharedPool: WasmWorkerPool | undefined;

/** The process-wide pool every run shares. */
export function sandboxWasmWorkerPool(): WasmWorkerPool {
  sharedPool ??= new WasmWorkerPool();
  return sharedPool;
}

/** Destroy the process-wide pool. Tests only. */
export function resetSandboxWasmWorkerPool(): void {
  sharedPool?.dispose();
  sharedPool = undefined;
}

// ---------------------------------------------------------------------------
// Per-run dispatcher
// ---------------------------------------------------------------------------

interface RunModule {
  readonly specifier: string;
  readonly contentDigest: string;
  readonly bytes: Uint8Array;
  readonly contract: SandboxWasmContract;
  /** Alias -> the binary's own name and signature. */
  readonly exports: ReadonlyMap<string, { wasmName: string; signature: WasmSignature }>;
  readonly callTimeoutMs: number;
}

/** The budgets in force for one invocation, after every manifest has lowered them. */
interface SandboxWasmBudgets {
  readonly callConcurrency: number;
  readonly callsPerInvocation: number;
  readonly wallClockMs: number;
}

export interface SandboxWasmDispatcher {
  /** Specifiers this run may call, in declaration order. */
  readonly specifiers: readonly string[];
  readonly budgets: SandboxWasmBudgets;
  /** Highest number of calls this run ever had in flight at once. */
  readonly peakConcurrency: number;
  /**
   * The one entry point guest code reaches. Every argument is untrusted: the
   * module key, the export name, and the argument list are all validated here
   * before a worker runs anything.
   */
  call(moduleKey: unknown, exportName: unknown, args: unknown): Promise<number | undefined>;
}

function lowered(
  key: keyof SandboxWasmLimits,
  modules: readonly ResolvedSandboxModule[]
): number {
  const ceiling = SANDBOX_WASM_BUDGETS[key];
  let value: number = ceiling;
  for (const module of modules) {
    if (module.kind !== "wasm") continue;
    const asked = module.wasm.limits?.[key];
    if (asked !== undefined && asked < value) value = asked;
  }
  return value;
}

/**
 * Build the dispatcher for one invocation, or `undefined` when the run
 * declares no WASM modules.
 *
 * Per-invocation budgets are the lowest any declared module asks for: a
 * manifest lowers a bound for everything in the run it takes part in, because
 * the bound is on the invocation, not on the module.
 */
export function createSandboxWasmDispatcher(
  modules: readonly ResolvedSandboxModule[],
  options: { pool?: WasmWorkerPool; signal?: AbortSignal } = {}
): SandboxWasmDispatcher | undefined {
  const wasmModules = modules.filter(
    (module): module is Extract<ResolvedSandboxModule, { kind: "wasm" }> =>
      module.kind === "wasm"
  );
  if (wasmModules.length === 0) return undefined;

  const pool = options.pool ?? sandboxWasmWorkerPool();
  const byKey = new Map<string, RunModule>();
  for (const module of wasmModules) {
    const binary = parseWasmBinary(module.bytes);
    const exports = new Map<string, { wasmName: string; signature: WasmSignature }>();
    for (const exported of module.wasm.exports) {
      const entry = binary.exports.get(exported.wasm);
      const signature = entry === undefined ? undefined : binary.functions[entry.index];
      if (signature === undefined) {
        throw new SandboxWasmError(
          `${module.specifier}: export ${exported.wasm} has no signature in the binary`
        );
      }
      exports.set(exported.as, { wasmName: exported.wasm, signature });
    }
    byKey.set(module.specifier, {
      specifier: module.specifier,
      contentDigest: module.contentDigest,
      bytes: module.bytes,
      contract: module.wasm,
      exports,
      callTimeoutMs:
        module.wasm.limits?.callTimeoutMs ?? SANDBOX_WASM_BUDGETS.callTimeoutMs
    });
  }

  const budgets: SandboxWasmBudgets = {
    callConcurrency: lowered("callConcurrency", wasmModules),
    callsPerInvocation: lowered("callsPerInvocation", wasmModules),
    wallClockMs: lowered("wallClockMs", wasmModules)
  };

  let callsUsed = 0;
  let wallClockUsed = 0;
  let inFlight = 0;
  let peakConcurrency = 0;
  const queue: (() => void)[] = [];

  const enter = async (): Promise<void> => {
    if (inFlight >= budgets.callConcurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    inFlight += 1;
    if (inFlight > peakConcurrency) peakConcurrency = inFlight;
  };
  const leave = (): void => {
    inFlight -= 1;
    queue.shift()?.();
  };

  return {
    specifiers: wasmModules.map((module) => module.specifier),
    budgets,
    get peakConcurrency() {
      return peakConcurrency;
    },
    async call(moduleKey, exportName, args) {
      const signal = options.signal;
      if (isAborted(signal)) throw cancelled();
      const runModule = isString(moduleKey) ? byKey.get(moduleKey) : undefined;
      if (runModule === undefined) {
        throw new SandboxWasmError(
          `${describe(moduleKey)} is not a WASM sandbox module this run serves`
        );
      }
      const exported =
        isString(exportName) ? runModule.exports.get(exportName) : undefined;
      if (exported === undefined) {
        throw new SandboxWasmError(
          `${runModule.specifier} has no export named ${describe(exportName)}`
        );
      }
      const converted = convertArguments(
        runModule.specifier,
        exportName as string,
        exported.signature,
        args
      );

      if (callsUsed >= budgets.callsPerInvocation) {
        throw new SandboxWasmError(
          `${runModule.specifier}: this node exhausted its budget of ${budgets.callsPerInvocation} WASM calls per invocation`
        );
      }
      callsUsed += 1;

      const compiled = await compileSandboxWasm(runModule.contentDigest, runModule.bytes);
      // Every await between the entry check and the dispatch is rechecked:
      // compiling a large module and queueing behind a busy slot both take
      // long enough for the run to be cancelled underneath them. The queue
      // needs no cancellation of its own — the calls holding the slots share
      // this signal, so their own aborts release them and this one is turned
      // away as soon as it is admitted.
      if (isAborted(signal)) throw cancelled();
      await enter();
      if (isAborted(signal)) {
        leave();
        throw cancelled();
      }

      // The wall clock is *reserved* here, not merely read: charging only on
      // completion let every concurrently admitted call see the whole
      // remainder, so two calls under the default concurrency of 2 could each
      // be handed a 30 s budget and spend 60 s of worker time between them.
      // Read and reserve sit in one synchronous run of this function — no
      // await between them — so a second call admitted meanwhile can only ever
      // see what is left after this one took its share.
      const remainingWallClock = budgets.wallClockMs - wallClockUsed;
      if (remainingWallClock <= 0) {
        leave();
        throw new SandboxWasmError(
          `${runModule.specifier}: this node exhausted its budget of ${budgets.wallClockMs} ms of WASM wall clock per invocation`
        );
      }
      const reserved = Math.min(runModule.callTimeoutMs, remainingWallClock);
      wallClockUsed += reserved;

      const startedAt = Date.now();
      let cutAtTimeout = false;
      try {
        // The effective timeout is the reservation, so the call cannot outrun
        // what it was actually admitted for.
        return await pool.run(compiled, exported.wasmName, converted, reserved, signal);
      } catch (error) {
        cutAtTimeout =
          error instanceof SandboxWasmError &&
          error.message.includes("per-call timeout");
        throw error;
      } finally {
        // Replace the reservation with what the call really cost: a fast call
        // refunds the difference. A call cut at its timeout keeps at least its
        // full reservation — the kill can be measured a millisecond early, and
        // refunding that sliver admits a next call the budget says is refused.
        const elapsed = Date.now() - startedAt;
        wallClockUsed +=
          (cutAtTimeout ? Math.max(elapsed, reserved) : elapsed) - reserved;
        leave();
      }
    }
  };
}

function describe(value: unknown): string {
  if (isString(value)) return JSON.stringify(value);
  return `a ${value === null ? "null" : typeof value} value`;
}

/**
 * Validate and convert one call's arguments host-side.
 *
 * Never left to WebAssembly's implicit coercion, so Node and the browser
 * answer the same: an `i32` must be a finite integer inside int32 range and
 * out-of-range rejects rather than wrapping, while `f32`/`f64` take any JS
 * number — `NaN` and infinities included — and `f32` rounds by WebAssembly's
 * own rules inside the call.
 */
export function convertArguments(
  specifier: string,
  exportName: string,
  signature: WasmSignature,
  args: unknown
): number[] {
  if (!Array.isArray(args)) {
    throw new SandboxWasmError(
      `${specifier}: ${exportName} was called with a non-list argument`
    );
  }
  if (args.length !== signature.parameters.length) {
    throw new SandboxWasmError(
      `${specifier}: ${exportName} takes ${signature.parameters.length} argument${signature.parameters.length === 1 ? "" : "s"}, received ${args.length}`
    );
  }
  return signature.parameters.map((type, position) =>
    convertArgument(specifier, exportName, type, position, args[position])
  );
}

function convertArgument(
  specifier: string,
  exportName: string,
  type: number,
  position: number,
  value: unknown
): number {
  const where = `${specifier}: ${exportName} argument ${position} expects ${wasmValueTypeName(type)}`;
  if (!isNumber(value)) {
    throw new SandboxWasmError(`${where}, received ${describeValue(value)}`);
  }
  if (type === WASM_VALUE_TYPE.F32 || type === WASM_VALUE_TYPE.F64) return value;
  if (type !== WASM_VALUE_TYPE.I32) {
    throw new SandboxWasmError(
      `${specifier}: ${exportName} argument ${position} uses ${wasmValueTypeName(type)}, which the scalar contract does not carry`
    );
  }
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new SandboxWasmError(`${where}, received ${describeValue(value)}`);
  }
  if (value < INT32_MIN || value > INT32_MAX) {
    throw new SandboxWasmError(
      `${where} in the range ${INT32_MIN}…${INT32_MAX}, received ${value}`
    );
  }
  return value;
}

function describeValue(value: unknown): string {
  if (typeof value === "bigint") return `the bigint ${value}`;
  if (isNumber(value)) {
    if (Number.isNaN(value)) return "NaN";
    if (!Number.isFinite(value)) return String(value);
    return `the non-integer ${value}`;
  }
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value} value`;
}
