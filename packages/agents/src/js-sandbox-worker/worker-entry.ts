/**
 * Worker main for the off-thread QuickJS sandbox.
 *
 * One engine per worker, one run at a time. Everything the guest reaches that
 * lives on the main thread — every bridge, every dispatcher, every
 * function-valued caller global — is rebuilt here as a proxy that posts an RPC
 * and awaits the reply, which is indistinguishable from an ordinary async host
 * function to the library's `expose()`.
 *
 * Three things are deliberately *not* proxied, because the guest reads them
 * synchronously and a round trip has no synchronous answer: `crypto.randomUUID`
 * and `crypto.getRandomValues`, which are reimplemented over the worker's own
 * WebCrypto, and `stream.open`, which is served from a mirror seeded at run
 * start and push-updated when a handle closes.
 *
 * This module is never statically imported by `js-sandbox.ts` — it is loaded
 * only as a worker entry.
 */

import { loadQuickJs } from "@sebastianwessel/quickjs";
import { importNodeBuiltin } from "@nodetool-ai/config";

import { MAX_RANDOM_BYTES } from "../js-sandbox.js";
import { toGuestBytes } from "../sandbox-bytes.js";
import {
  registerTypedArraySerializers,
  runInterpreter,
  SANDBOX_STREAM_OPEN_BINDING,
  type SandboxDispatchCall
} from "./interpreter.js";
import {
  interpreterResultMessage,
  isHostToWorkerMessage,
  SANDBOX_DISPATCHER_BINDINGS,
  type BridgeShape,
  type RunMessage,
  type SandboxDispatcherKind,
  type WorkerToHostMessage
} from "./protocol.js";

import * as quickJsVariantModule from "@jitl/quickjs-ng-wasmfile-release-sync";
import { isFiniteNumber, isObjectLike } from "../utils/type-guards.js";
/**
 * The variant package is CJS with a `default` export, so `ns.default` is the
 * variant at runtime.
 */
// SAFETY: TypeScript's CJS interop synthesizes `default` as the whole module
// object, contradicting the package's own `.d.ts`, which declares it as the
// `QuickJSSyncVariant` this reads.
const quickJsVariant = (
  quickJsVariantModule as unknown as {
    default: Parameters<typeof loadQuickJs>[0];
  }
).default;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

let enginePromise: ReturnType<typeof loadQuickJs> | null = null;

/**
 * One engine per worker.
 *
 * `registerTypedArraySerializers` mutates the library's module-global
 * serializer table, and a worker holds its own module instance, so it registers
 * its own before the first run.
 */
function getEngine(): ReturnType<typeof loadQuickJs> {
  registerTypedArraySerializers();
  if (!enginePromise) enginePromise = loadQuickJs(quickJsVariant);
  return enginePromise;
}

// ---------------------------------------------------------------------------
// Run state
// ---------------------------------------------------------------------------

type Port = {
  postMessage(message: WorkerToHostMessage): void;
  on(event: "message", handler: (payload: unknown) => void): void;
};

type Pending = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
};

class RunSession {
  private readonly pending = new Map<number, Pending>();
  private nextRpcId = 0;
  private suspended = 0;
  private readonly streamOpen: Map<string, boolean>;

  constructor(
    private readonly port: Port,
    private readonly run: RunMessage
  ) {
    this.streamOpen = new Map(Object.entries(run.streamOpenSeed ?? {}));
  }

  suspendedMs = (): number => this.suspended;

  setSuspendedMs(value: number): void {
    this.suspended = value;
  }

  closeStream(handle: string): void {
    this.streamOpen.set(handle, false);
  }

  /**
   * Answer `stream.open(handle)` from the mirror.
   *
   * `null` means the run carries no input stream at all — the prelude turns
   * that into the no-input-stream throw, matching the in-process binding. A
   * stale `true` is harmless: streams are close-only, so the worst case is
   * one extra take that comes back done.
   */
  isStreamOpen = (handle: unknown): boolean | null =>
    this.run.streamOpenSeed === null
      ? null
      : this.streamOpen.get(String(handle)) === true;

  settleRpc(id: number, ok: boolean, value: unknown, error?: Error): void {
    const pending = this.pending.get(id);
    if (pending === undefined) return;
    this.pending.delete(id);
    if (ok) pending.resolve(value);
    else pending.reject(error ?? new Error("the sandbox bridge call failed"));
  }

  call(path: readonly string[], args: readonly unknown[]): Promise<unknown> {
    const id = this.nextRpcId++;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.port.postMessage({ type: "rpc", id, path, args });
    });
  }

  log(line: string): void {
    this.port.postMessage({ type: "log", line });
  }

  progress(percent: number, message?: string): void {
    this.port.postMessage(
      message === undefined
        ? { type: "progress", percent }
        : { type: "progress", percent, message }
    );
  }
}

// ---------------------------------------------------------------------------
// Bridge reconstruction
// ---------------------------------------------------------------------------

/** Random bytes, tagged the way the host bridge tags them. */
function getRandomValues(requested: unknown): Record<string, string> {
  const size =
    isFiniteNumber(requested)
      ? Math.min(Math.max(Math.floor(requested), 0), MAX_RANDOM_BYTES)
      : 0;
  const bytes = new Uint8Array(size);
  if (size > 0) globalThis.crypto.getRandomValues(bytes);
  return toGuestBytes(bytes);
}

/** One RPC proxy, indistinguishable from an async host function to `expose()`. */
function proxyFor(
  session: RunSession,
  path: readonly string[]
): (...args: unknown[]) => Promise<unknown> {
  return (...args: unknown[]) => session.call(path, args);
}

/**
 * Rebuild the record `buildSandbox` would have produced, from names alone.
 *
 * Every entry is an RPC proxy, a value that travelled by clone, or one of the
 * three synchronous locals this worker owns. Those three are handed over
 * unwrapped and the interpreter passes them through unwrapped: a round trip has
 * no synchronous answer, and `stream.open` in particular is a function that
 * must never be wrapped.
 */
function buildSandboxRecord(
  shape: BridgeShape,
  session: RunSession
) {
  const sandbox: Record<string, unknown> = {};
  for (const name of shape.flat) sandbox[name] = proxyFor(session, [name]);
  for (const [name, value] of Object.entries(shape.values))
    sandbox[name] = value;
  for (const [name, members] of Object.entries(shape.objects)) {
    const table: Record<string, unknown> = {};
    for (const member of members)
      table[member] = proxyFor(session, [name, member]);
    sandbox[name] = table;
  }

  // `crypto.digest`/`hmac` stay proxied; the other two are worker-local.
  const crypto = (sandbox.crypto ?? {}) as Record<string, unknown>;
  crypto.randomUUID = () => globalThis.crypto.randomUUID();
  crypto.getRandomValues = getRandomValues;
  sandbox.crypto = crypto;
  sandbox[SANDBOX_STREAM_OPEN_BINDING] = session.isStreamOpen;

  return sandbox;
}

/**
 * Caller globals, kept apart from the sandbox record.
 *
 * The interpreter applies them last so a global can shadow a non-reserved
 * name, and it is the only place where "function → wrap, value → pass through"
 * is the right rule. Merging them into the sandbox record would lose that.
 */
function buildGlobalsRecord(
  shape: BridgeShape,
  session: RunSession
) {
  const globals: Record<string, unknown> = {};
  for (const [name, global] of Object.entries(shape.globals)) {
    globals[name] =
      global.kind === "fn" ? proxyFor(session, [name]) : global.value;
  }
  return globals;
}

/** Object-typed globals, whose contents are read back out of the guest. */
function syncTargetNames(shape: BridgeShape): string[] {
  return Object.entries(shape.globals)
    .filter(
      ([, global]) =>
        global.kind === "value" &&
        isObjectLike(global.value)
    )
    .map(([name]) => name);
}

/**
 * A dispatcher proxy, present only when the run declared that kind.
 *
 * Presence is what decides the guest binding and the init prelude's
 * conditional text, so the three travel as named optionals rather than as keys
 * in an untyped record.
 */
function dispatcherCall(
  shape: BridgeShape,
  session: RunSession,
  kind: SandboxDispatcherKind
): SandboxDispatchCall | undefined {
  if (!shape.dispatchers.includes(kind)) return undefined;
  const binding = SANDBOX_DISPATCHER_BINDINGS[kind];
  const proxy = proxyFor(session, [binding]);
  return (moduleKey, exportName, args) => proxy(moduleKey, exportName, args);
}

// ---------------------------------------------------------------------------
// Worker main
// ---------------------------------------------------------------------------

/**
 * An optional param, omitted rather than passed as `undefined`.
 *
 * The interpreter reads presence, not value: a `wasmCall` key that is there and
 * undefined would still be a declared dispatcher.
 */
function spreadIfSet<K extends string, V>(
  key: K,
  value: V | undefined
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

/** The result message a run that threw before reporting posts back. */
type RunFailureMessage = {
  type: "result";
  runId: string;
  evalOk: false;
  errorName: string;
  errorMessage: string;
  errorStack?: string;
};

async function executeRun(
  port: Port,
  run: RunMessage,
  session: RunSession
): Promise<void> {
  const { runSandboxed } = await getEngine();
  const shape = run.bridgeShape;

  const outcome = await runInterpreter({
    runSandboxed,
    code: run.code,
    sandbox: buildSandboxRecord(shape, session),
    globals: buildGlobalsRecord(shape, session),
    syncTargetNames: syncTargetNames(shape),
    ...spreadIfSet("wasmCall", dispatcherCall(shape, session, "wasm")),
    ...spreadIfSet("hostCall", dispatcherCall(shape, session, "host")),
    ...spreadIfSet(
      "capabilityCall",
      dispatcherCall(shape, session, "capability")
    ),
    ...spreadIfSet("modules", run.modules),
    ...spreadIfSet("capabilityFacades", run.capabilityFacades),
    timeoutMs: run.timeoutMs,
    limits: run.limits,
    suspendAllowanceMs: run.suspendAllowanceMs,
    hasClock: run.hasClock,
    // No isAborted: cancellation from the host is `worker.terminate()`, so the
    // interrupt handler in here enforces only the deadline.
    suspendedMs: session.suspendedMs
  });

  port.postMessage(interpreterResultMessage(run.runId, outcome));
}

export async function startWorker(port: Port): Promise<void> {
  let session: RunSession | undefined;

  port.on("message", (raw: unknown) => {
    if (!isHostToWorkerMessage(raw)) return;
    switch (raw.type) {
      case "run": {
        const active = new RunSession(port, raw);
        session = active;
        void executeRun(port, raw, active).catch((error: unknown) => {
          const failed: RunFailureMessage = {
            type: "result",
            runId: raw.runId,
            evalOk: false,
            errorName: error instanceof Error ? error.name : "Error",
            errorMessage: error instanceof Error ? error.message : String(error)
          };
          if (error instanceof Error && error.stack !== undefined) {
            failed.errorStack = error.stack;
          }
          port.postMessage(failed);
        });
        return;
      }
      case "suspend-update":
        session?.setSuspendedMs(raw.suspendedMs);
        return;
      case "stream-closed":
        session?.closeStream(raw.handle);
        return;
      case "rpc-reply":
        if (raw.ok) session?.settleRpc(raw.id, true, raw.value);
        else {
          const error = new Error(raw.message);
          error.name = raw.name;
          session?.settleRpc(raw.id, false, undefined, error);
        }
    }
  });
}

/**
 * Boot only under `worker_threads`.
 *
 * Importing this module on the main thread — a stray import, a bundler that
 * pulled it into a graph — must do nothing rather than install a message
 * handler on a port that is not a worker's.
 */
const threads = await importNodeBuiltin<{ parentPort: Port | null }>(
  "node:worker_threads"
);
if (threads?.parentPort != null) {
  await startWorker(threads.parentPort);
}
