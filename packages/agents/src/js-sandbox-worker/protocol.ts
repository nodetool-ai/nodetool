/**
 * The wire contract between the main thread and the QuickJS sandbox worker.
 *
 * A CPU-bound guest never yields, so the interpreter runs on a `worker_threads`
 * thread and every host bridge it calls becomes a message. This module holds
 * the message types, the derivation that tells the worker which bridge names to
 * build proxies for, and the pre-scan that decides whether a run's caller
 * globals can cross a structured clone at all.
 *
 * It is imported by `js-sandbox.ts`, which is the browser-safe subpath export,
 * so nothing here may touch a Node builtin.
 */

import type { SandboxModuleResolution } from "@nodetool-ai/protocol";

import type { ResolvedSandboxLimits } from "../js-sandbox.js";
import {
  SANDBOX_CAPABILITY_BRIDGE_BINDING,
  SANDBOX_HOST_BRIDGE_BINDING,
  SANDBOX_WASM_BRIDGE_BINDING,
  type InterpreterOutcome
} from "./interpreter.js";

// ---------------------------------------------------------------------------
// Bridge shape
// ---------------------------------------------------------------------------

/** The three host dispatchers, which stay on the main thread. */
export const SANDBOX_DISPATCHER_KINDS = ["wasm", "host", "capability"] as const;

export type SandboxDispatcherKind = (typeof SANDBOX_DISPATCHER_KINDS)[number];

/** Guest binding name each dispatcher is exposed under. */
export const SANDBOX_DISPATCHER_BINDINGS: Readonly<
  Record<SandboxDispatcherKind, string>
> = {
  wasm: SANDBOX_WASM_BRIDGE_BINDING,
  host: SANDBOX_HOST_BRIDGE_BINDING,
  capability: SANDBOX_CAPABILITY_BRIDGE_BINDING
};

/** A caller-supplied global, as the worker has to rebuild it. */
export type GlobalShape =
  | { readonly kind: "fn" }
  | { readonly kind: "value"; readonly value: unknown };

/**
 * What the worker needs in order to reconstruct the bridge table.
 *
 * The bridges themselves are host closures and cannot be cloned, so only their
 * *names* cross; the worker turns each into an RPC proxy that posts the path
 * back. `values` is the one exception — bridges like `__maxIter` and
 * `__secretScope` are plain data the guest reads directly, and proxying them
 * would turn a property read into a round trip.
 */
export interface BridgeShape {
  /** Top-level function bridges: `fetch`, `sleep`, `__takeInput`, … */
  readonly flat: readonly string[];
  /** Object bridges and their member names: `workspace`, `image`, `crypto`, … */
  readonly objects: Readonly<Record<string, readonly string[]>>;
  /** Non-function bridge values, passed by value. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Dispatchers this run exposes; each becomes one RPC proxy. */
  readonly dispatchers: readonly SandboxDispatcherKind[];
  /** Caller globals, function-valued ones proxied like a bridge. */
  readonly globals: Readonly<Record<string, GlobalShape>>;
}

/** The main-side table {@link deriveBridgeShape} reads. */
export interface BridgeTable {
  /** The record `expose()` would receive, minus caller globals. */
  readonly bridges: Readonly<Record<string, unknown>>;
  /** Dispatchers the run built, in any order. */
  readonly dispatchers?: readonly SandboxDispatcherKind[];
  /** Caller-supplied globals, already filtered by the host. */
  readonly globals?: Readonly<Record<string, unknown>>;
}

function isMemberTable(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return false;
  return entries.every(([, member]) => typeof member === "function");
}

/**
 * Classify a main-side bridge table into what the worker can rebuild.
 *
 * Names are sorted so two derivations of one table compare equal — the shape
 * travels in every run message, and a stable order keeps a diff readable.
 */
export function deriveBridgeShape(table: BridgeTable): BridgeShape {
  const flat: string[] = [];
  const objects: Record<string, readonly string[]> = {};
  const values: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(table.bridges)) {
    if (typeof value === "function") {
      flat.push(name);
    } else if (isMemberTable(value)) {
      objects[name] = Object.keys(value).sort();
    } else {
      values[name] = value;
    }
  }

  const declared = new Set(table.dispatchers ?? []);
  const dispatchers = SANDBOX_DISPATCHER_KINDS.filter((kind) =>
    declared.has(kind)
  );

  const globals: Record<string, GlobalShape> = {};
  for (const [name, value] of Object.entries(table.globals ?? {})) {
    globals[name] =
      typeof value === "function" ? { kind: "fn" } : { kind: "value", value };
  }

  return { flat: flat.sort(), objects, values, dispatchers, globals };
}

// ---------------------------------------------------------------------------
// Clone-safety pre-scan
// ---------------------------------------------------------------------------

export type CloneSafetyVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Depth past which the scan stops looking.
 *
 * Accepting beyond the cap is safe rather than optimistic: `postMessage` throws
 * `DataCloneError` synchronously, so a value the scan let through still fails
 * closed on the main thread and falls back in-process.
 */
const MAX_PRECHECK_DEPTH = 32;

const CLONEABLE_TAGS = new Set([
  "[object Date]",
  "[object RegExp]",
  "[object ArrayBuffer]",
  "[object SharedArrayBuffer]",
  "[object DataView]",
  "[object Error]",
  "[object Boolean]",
  "[object Number]",
  "[object String]"
]);

function describe(value: unknown): string {
  if (value === null) return "null";
  if (typeof value !== "object") return typeof value;
  const name = (value as object).constructor?.name;
  return name && name !== "Object" ? name : "object";
}

/**
 * What the scan holds once arrays, Maps, Sets, buffer views and the
 * clone-tagged built-ins are behind it: either a plain object literal or a
 * class instance, told apart by the prototype its constructor came from.
 */
interface ScannedObject {
  readonly constructor?: Function;
}

function isPlainObject(value: ScannedObject): boolean {
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === null || proto === Object.prototype;
}

function scan(
  value: unknown,
  path: string,
  depth: number,
  seen: Set<object>
): string | null {
  if (value === null) return null;
  const type = typeof value;
  if (type === "function") {
    return `${path} is a function; only a top-level global may be a function`;
  }
  if (type === "symbol") return `${path} is a symbol, which cannot be cloned`;
  if (type !== "object") return null;

  const object = value as object;
  if (seen.has(object)) return null;
  seen.add(object);
  if (depth >= MAX_PRECHECK_DEPTH) return null;

  if (
    ArrayBuffer.isView(object) ||
    CLONEABLE_TAGS.has(Object.prototype.toString.call(object))
  ) {
    return null;
  }
  if (Array.isArray(object)) {
    for (let i = 0; i < object.length; i++) {
      const reason = scan(object[i], `${path}[${i}]`, depth + 1, seen);
      if (reason !== null) return reason;
    }
    return null;
  }
  if (object instanceof Map) {
    for (const [key, entry] of object) {
      const reason =
        scan(key, `${path} (Map key)`, depth + 1, seen) ??
        scan(entry, `${path}.get(…)`, depth + 1, seen);
      if (reason !== null) return reason;
    }
    return null;
  }
  if (object instanceof Set) {
    for (const entry of object) {
      const reason = scan(entry, `${path} (Set entry)`, depth + 1, seen);
      if (reason !== null) return reason;
    }
    return null;
  }
  if (!isPlainObject(object)) {
    return `${path} is a ${describe(object)} instance, which loses its prototype in a structured clone`;
  }
  for (const [key, entry] of Object.entries(
    object as Record<string, unknown>
  )) {
    const reason = scan(entry, `${path}.${key}`, depth + 1, seen);
    if (reason !== null) return reason;
  }
  return null;
}

/**
 * Decide whether a run's caller globals can cross to the worker.
 *
 * A top-level function value is fine — it becomes an RPC proxy. Everything else
 * has to survive a structured clone unchanged, which rules out a function
 * nested inside an object (nothing on the far side could call it) and a class
 * instance (the clone arrives as a plain object, so a method call there throws
 * where the in-process path worked).
 */
export function precheckCloneSafety(
  globals: Readonly<Record<string, unknown>>
): CloneSafetyVerdict {
  for (const [name, value] of Object.entries(globals)) {
    if (typeof value === "function") continue;
    const reason = scan(value, `globals.${name}`, 0, new Set<object>());
    if (reason !== null) return { ok: false, reason };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Main → worker
// ---------------------------------------------------------------------------

/** Everything the worker needs to run one guest program. */
export interface RunMessage {
  readonly type: "run";
  readonly runId: string;
  readonly code: string;
  readonly timeoutMs: number;
  readonly limits: ResolvedSandboxLimits;
  readonly suspendAllowanceMs: number;
  /** Whether the host owns a suspendable clock for this run. */
  readonly hasClock: boolean;
  /** The engine's own wall-clock backstop, already clamped by the host. */
  readonly engineTimeoutMs: number;
  readonly modules?: SandboxModuleResolution;
  /** Guest specifier → generated facade source for the platform's modules. */
  readonly capabilityFacades?: ReadonlyMap<string, string>;
  /** Seed for the worker-local `stream.open` mirror; `null` reads all closed. */
  readonly streamOpenSeed: Readonly<Record<string, boolean>> | null;
  readonly bridgeShape: BridgeShape;
}

/** Suspended-time credit, pushed while the guest is parked on a take. */
export interface SuspendUpdateMessage {
  readonly type: "suspend-update";
  readonly runId: string;
  readonly suspendedMs: number;
}

/** One input handle reached end-of-stream. Streams never reopen. */
export interface StreamClosedMessage {
  readonly type: "stream-closed";
  readonly runId: string;
  readonly handle: string;
}

export type RpcReplyMessage =
  | {
      readonly type: "rpc-reply";
      readonly id: number;
      readonly ok: true;
      readonly value: unknown;
    }
  | {
      readonly type: "rpc-reply";
      readonly id: number;
      readonly ok: false;
      readonly name: string;
      readonly message: string;
    };

export type HostToWorkerMessage =
  | RunMessage
  | SuspendUpdateMessage
  | StreamClosedMessage
  | RpcReplyMessage;

// ---------------------------------------------------------------------------
// Worker → main
// ---------------------------------------------------------------------------

/** One bridge call, addressed by the path the worker proxied. */
export interface RpcRequestMessage {
  readonly type: "rpc";
  readonly id: number;
  /** `["workspace", "read"]`, `["fetch"]`, `["__wasmCall"]`, … */
  readonly path: readonly string[];
  readonly args: readonly unknown[];
}

/** Fire-and-forget: port FIFO puts every line ahead of the result. */
export interface LogMessage {
  readonly type: "log";
  readonly line: string;
}

export interface ProgressMessage {
  readonly type: "progress";
  readonly percent: number;
  readonly message?: string;
}

/**
 * How a run settled.
 *
 * `failure` distinguishes the two outcomes the guest did not produce: a worker
 * that died mid-run and a run the host cancelled. The main thread maps the
 * first through `describeEngineFailure`; a plain guest error carries no
 * `failure` and is reported as-is.
 */
export interface ResultMessage {
  readonly type: "result";
  readonly runId: string;
  readonly evalOk: boolean;
  readonly data?: unknown;
  readonly errorName?: string;
  readonly errorMessage?: string;
  readonly errorStack?: string;
  /** Extracted object-global snapshots; the host replaces them in place. */
  readonly syncedGlobals?: Record<string, unknown>;
  readonly failure?: "worker" | "cancelled";
}

export type WorkerToHostMessage =
  | RpcRequestMessage
  | LogMessage
  | ProgressMessage
  | ResultMessage;

/**
 * Flatten an interpreter outcome onto the wire.
 *
 * The interpreter returns a discriminated union, which is the right shape for a
 * function whose two branches carry different fields. A message is the other
 * thing: it has to clone, and `structuredClone` has no notion of a tag, so the
 * flat form is what crosses. `syncedGlobals` rides on both branches — the
 * extractor runs even when the guest code failed.
 */
/** {@link ResultMessage} with `readonly` dropped, so it can be filled in steps. */
type MutableResultMessage = {
  -readonly [K in keyof ResultMessage]: ResultMessage[K];
};

export function interpreterResultMessage(
  runId: string,
  outcome: InterpreterOutcome
): ResultMessage {
  const synced =
    outcome.syncedGlobals === undefined
      ? {}
      : { syncedGlobals: outcome.syncedGlobals };
  if (outcome.ok) {
    return {
      type: "result",
      runId,
      evalOk: true,
      data: outcome.data,
      ...synced
    };
  }
  const failed: MutableResultMessage = {
    type: "result",
    runId,
    evalOk: false,
    errorName: outcome.error.name,
    errorMessage: outcome.error.message,
    ...synced
  };
  if (outcome.error.stack !== undefined) {
    failed.errorStack = outcome.error.stack;
  }
  return failed;
}

function isTagged(value: unknown): value is { type: unknown } {
  return value !== null && typeof value === "object" && "type" in value;
}

export function isWorkerToHostMessage(
  value: unknown
): value is WorkerToHostMessage {
  if (!isTagged(value)) return false;
  return (
    value.type === "rpc" ||
    value.type === "log" ||
    value.type === "progress" ||
    value.type === "result"
  );
}

export function isHostToWorkerMessage(
  value: unknown
): value is HostToWorkerMessage {
  if (!isTagged(value)) return false;
  return (
    value.type === "run" ||
    value.type === "suspend-update" ||
    value.type === "stream-closed" ||
    value.type === "rpc-reply"
  );
}
