/**
 * Shared sandboxed JavaScript execution engine.
 *
 * Used by the CodeAct executor (agent actions) and the CodeNode (workflow node).
 * Runs user code in an isolated QuickJS WebAssembly context — the guest has its
 * own heap inside the WASM instance, so there is a real memory/CPU boundary
 * between host and guest (unlike Node's `node:vm`, which shares the V8 heap).
 *
 * The exposed surface is a small curated one: vanilla JavaScript plus a handful
 * of bridge functions (`fetch`, `workspace`, `getSecret`, `sleep`,
 * `assetToSandbox`, `sandboxToAsset`, `crypto`, `console`, `progress`,
 * `format`, `image`, `canvas`) and a few pure guest-side helpers
 * (`toBase64`, `fromBase64`, `toHex`, `fromHex`,
 * `parallelMap`, `createCanvas`). `crypto`
 * covers `randomUUID`, `getRandomValues`, `digest`, and `hmac`
 * (WebCrypto-backed); `workspace` covers text and binary reads/writes plus
 * `stat`, `mkdir`, and `remove`; `progress` forwards a percentage and label to
 * the host caller (rate-limited); `format` exposes host `Intl` number, date,
 * relative-time and list formatting, which QuickJS itself does not ship.
 * Every quantitative limit (fetch calls, response body, output size,
 * guest heap, stack, fetch timeout) is overridable per invocation through
 * `RunSandboxOptions.limits`, clamped to hard ceilings.
 *
 * The guest imports nothing by default — without `RunSandboxOptions.modules`
 * there is no loader at all, so user code cannot `import`/`require` anything.
 * With it, the run's declared sandbox packages and their intra-pack siblings
 * are the only importable modules (see {@link createGuestModuleHost}), and
 * dynamic `import()` stays denied.
 *
 * **Every library the sandbox offers is an importable module.** Some are guest
 * modules the compiler admitted (js-yaml, date-fns); the rest are *host
 * modules* — papaparse, cheerio, exceljs, fflate and friends — which run on the
 * host behind a generated ESM facade over a per-run dispatcher
 * (`host-modules/`), because they need Node builtins the guest lacks or carry a
 * limit the guest could not enforce. Either way the guest writes `import`, and
 * the pack has to be installed and declared. The remaining globals — `fetch`,
 * `workspace`, `getSecret`, the asset bridges, `format.*` (Intl), `crypto.*`
 * (WebCrypto), `image.*`/`canvas.*` — are not libraries: they are the
 * capabilities the node granted this run.
 *
 * The sandbox is fully asynchronous. Every host bridge call returns a real
 * promise, and a bridge call starts its host-side work the moment it is
 * invoked — not when it is awaited — so `Promise.all` (and `allSettled`,
 * `race`, `any`) over bridge calls runs them in parallel on the host. Five
 * fetches under `Promise.all` take one round trip, not five. `parallelMap`
 * is the bounded form of that fan-out. `sleep` is the only timer: the
 * timer globals (`setTimeout` and friends) are deleted inside the user-code
 * module (see {@link wrapCode}), because timer callbacks would run outside
 * the never-reject/abort-guard conventions every bridge follows.
 */

import { loadQuickJs } from "@sebastianwessel/quickjs";
import {
  SANDBOX_CAPABILITY_DISPATCH_GLOBAL,
  SANDBOX_WASM_DISPATCH_GLOBAL,
  type SandboxModuleResolution
} from "@nodetool-ai/protocol";

import {
  createSandboxHostDispatcher,
  type SandboxHostDispatcher
} from "./host-modules/dispatcher.js";
import {
  EXPOSED_BRIDGE_NAMES,
  MAX_ENGINE_TIMEOUT_MS,
  NO_INPUT_STREAM_MESSAGE,
  registerTypedArraySerializers,
  runInterpreter,
  SANDBOX_CAPABILITY_BRIDGE_BINDING,
  SANDBOX_INPUT_TAKE_BINDING,
  SANDBOX_STREAM_OPEN_BINDING,
  SANDBOX_WASM_BRIDGE_BINDING,
  type InterpreterOutcome,
  type InterpreterParams,
  type SandboxDispatchCall
} from "./js-sandbox-worker/interpreter.js";
import {
  SANDBOX_SERIALIZE_MAX_DEPTH,
  toGuestBytes,
  toGuestBytesDeep,
  type GuestBytes
} from "./sandbox-bytes.js";
import {
  isBoolean,
  isFunction,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "./utils/type-guards.js";
import {
  createSandboxMediaStore,
  isSandboxMediaHandle,
  MAX_RUN_MEDIA_BYTES,
  type SandboxMediaMeta,
  type SandboxMediaType
} from "./sandbox-media-handle.js";
import {
  createMediaRefBridge,
  looksLikeMediaRef,
  mimeForRef,
  remapMediaRef,
  resolveRefBytes
} from "./sandbox-media-ref.js";
import type { MediaRefValue } from "@nodetool-ai/runtime";
import {
  createSandboxWasmDispatcher,
  type SandboxWasmDispatcher,
  type WasmWorkerPool
} from "./wasm-sandbox/host.js";
import { runInWorker } from "./js-sandbox-worker/host.js";
import type { RunInWorkerOptions } from "./js-sandbox-worker/host.js";
import {
  deriveBridgeShape,
  precheckCloneSafety,
  SANDBOX_DISPATCHER_BINDINGS,
  type ResultMessage as SandboxWorkerResult,
  type RunMessage,
  type SandboxDispatcherKind
} from "./js-sandbox-worker/protocol.js";

/** The same shape with `readonly` dropped, so a caller can fill it in steps. */
type Writable<T> = { -readonly [K in keyof T]: T[K] };
type WritableRun = Writable<Omit<RunMessage, "type">>;
type WritableRunInWorkerOptions = Writable<RunInWorkerOptions>;
import * as quickJsVariantModule from "@jitl/quickjs-ng-wasmfile-release-sync";
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
import { importNodeBuiltin } from "@nodetool-ai/config";
import type { AssetRef } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_SIZE = 100_000;
export const MAX_LOOP_ITERATIONS = 10_000;
export const MAX_FETCH_CALLS = 20;
export const MAX_RESPONSE_BODY_SIZE = 1_000_000;
/** Guest heap cap. QuickJS aborts if the guest tries to allocate beyond this. */
export const GUEST_MEMORY_LIMIT = 64 * 1024 * 1024;
/** Guest stack cap — protects against deeply recursive code. */
export const GUEST_STACK_LIMIT = 512 * 1024;
/** Per-request wall-clock cap for the fetch bridge. */
export const FETCH_TIMEOUT_MS = 15_000;
/** Redirect hops the fetch bridge follows before giving up. */
export const MAX_FETCH_REDIRECTS = 5;
/** Locale used by the `format` bridge when the caller names none. */
export const DEFAULT_FORMAT_LOCALE = "en-US";
/** Largest `crypto.getRandomValues` request the bridge will serve. */
export const MAX_RANDOM_BYTES = 65_536;
/** Progress reports forwarded to the host per run; further calls are dropped. */
export const MAX_PROGRESS_CALLS = 1000;
/**
 * Emitted values a run may deliver. Unlike progress reports, emits are never
 * dropped or rate-limited — every value reaches the host in call order — so the
 * cap is enforced by throwing in the guest rather than by ignoring the call.
 */
export const MAX_EMIT_CALLS = 10_000;
/** Minimum gap between two forwarded progress reports. */
export const PROGRESS_MIN_INTERVAL_MS = 100;
/** Longest progress message forwarded to the host. */
export const MAX_PROGRESS_MESSAGE_CHARS = 500;
/**
 * Headroom added to the engine's own wall-clock abort when a {@link SandboxClock}
 * is in play. The clock only stops the *guest's* budget; this bounds how long a
 * run may stay suspended in total, so a prompt nobody ever answers still ends.
 */
export const DEFAULT_SUSPEND_ALLOWANCE_MS = 30 * 60 * 1000;
/**
 * Suspension allowance a run with an input stream gets by default.
 *
 * Effectively unbounded, deliberately: a streaming body legitimately lives as
 * long as its upstream produces, and the run's own cancellation is the lifetime
 * bound. A stream that never ends is the upstream's bug, surfaced by the
 * runner — not a reason to kill a correct consumer. A caller that wants a
 * shorter leash passes {@link RunSandboxOptions.suspendAllowanceMs}.
 */
export const INPUT_STREAM_SUSPEND_ALLOWANCE_MS = MAX_ENGINE_TIMEOUT_MS;

/** Host sink for guest `progress()` calls. */
export type SandboxProgressCallback = (
  progress: number,
  message?: string
) => void;

/**
 * Host sink for guest `emit(name, value)` calls. Awaited before the guest's
 * promise resolves, so a slow consumer applies backpressure to the producer,
 * and a sink that throws surfaces in the guest as a thrown error.
 */
export type SandboxEmitCallback = (
  name: string,
  value: unknown
) => void | Promise<void>;

/** One value a guest `emit(name, value)` call delivered. */
export interface SandboxEmittedValue {
  name: string;
  value: unknown;
}

/**
 * One answer to a guest take: the next value for a handle, or end-of-stream.
 *
 * `done: true` ends the iteration the guest is driving — for a named handle
 * that upstream produced everything it will, for {@link SandboxTakeInputCallback}
 * called with `null` that every handle has.
 */
export type SandboxInputTake =
  | { done: true }
  | { done: false; handle: string; value: unknown };

/**
 * Host source behind the guest's `stream` global.
 *
 * `handle` names one input handle, or is `null` for `stream.any()` — "the next
 * value on any handle, in arrival order". The host keeps the iteration state
 * (one inbox iterator per handle plus one for `any`); the sandbox only relays
 * the call and marshals the answer. The returned `value` must already be
 * JSON-safe: the sandbox tags bytes for the guest prelude to revive but does
 * not deep-copy, exactly as with `globals`.
 */
export type SandboxTakeInputCallback = (
  handle: string | null
) => Promise<SandboxInputTake>;

/**
 * Host answer to `stream.open(name)`: could more arrive on this handle?
 *
 * Synchronous, because the guest call is — the value is inbox state the host
 * already holds, and an awaitable answer would make `if (stream.open(h))` read
 * true on a pending promise.
 */
export type SandboxStreamOpenCallback = (handle: string) => boolean;

/**
 * What the guest is told when it calls `stream` in a run that has no input
 * stream behind it. Shared by the host bridge and the guest prelude so both
 * paths say the same thing — the prelude lives with the interpreter, so the
 * message does too.
 */
export { NO_INPUT_STREAM_MESSAGE } from "./js-sandbox-worker/interpreter.js";

/** The input-side bridges {@link buildSandbox} wires behind the `stream` global. */
export interface SandboxInputStreams {
  /** Source of values. Without it every `stream` call throws. */
  onTakeInput?: SandboxTakeInputCallback;
  /** Answer to `stream.open(name)`. Without it every handle reads closed. */
  onStreamOpen?: SandboxStreamOpenCallback;
  /**
   * Clock suspended while a take is parked. Waiting on upstream is not guest
   * execution, so it must not be charged to the run's timeout.
   */
  clock?: SandboxClock;
}

/**
 * Per-invocation limit overrides. Every field defaults to the module constant
 * above and is clamped to a hard ceiling, so a caller can tighten a limit or
 * raise it within bounds but never switch a protection off.
 */
export interface SandboxLimits {
  maxFetchCalls?: number;
  maxResponseBodyBytes?: number;
  maxOutputSize?: number;
  memoryLimitBytes?: number;
  /**
   * Total bytes of media one run may hold host-side for its handles. The
   * aggregate the per-call image/media ceilings never bounded.
   */
  runMediaBytes?: number;
  stackLimitBytes?: number;
  fetchTimeoutMs?: number;
  /**
   * Permit fetches to loopback, link-local and private address ranges.
   *
   * Off by default: guest code is untrusted, so the SSRF guard is the norm and
   * this is the exception. It exists because the trusted `lib.http` nodes have
   * always been able to reach a local service, and a Code node replacing one
   * must be able to do the same — a workflow pointing at `http://localhost:8000`
   * would otherwise silently stop working.
   *
   * Host-set only: it is read from {@link RunSandboxOptions.limits} and never
   * exposed to the guest, so sandboxed code cannot turn it on for itself.
   */
  allowPrivateNetwork?: boolean;
  /** `User-Agent` for bridge fetches. Guest-set headers still win. */
  userAgent?: string;
  /**
   * `"workspace"` (default) confines every `workspace.*` call to the workspace
   * root, symlinks included. `"host"` lifts that to the whole filesystem the
   * process can reach, with `~` expanded.
   *
   * Off by default for the same reason as {@link allowPrivateNetwork}, and the
   * stakes are higher — host mode can read credential files. It exists because
   * roughly half the `lib.os` nodes already operate on arbitrary host paths
   * (`expandUser` + raw `node:fs`), so a Code node replacing one needs the same
   * reach. Host-set only, and the graph migration sets it only on nodes
   * rewritten from such a node — a hand-written or model-authored Code node
   * stays confined.
   */
  filesystemAccess?: "workspace" | "host";
  /**
   * The secret names this run may read, or `null`/absent for every secret the
   * store holds.
   *
   * A script that talks to an external service needs one credential, and
   * nothing about `getSecret` used to say so: a node written to send a Slack
   * message could read the AWS keys. Declaring the scope makes the credential
   * a node reaches part of the node, visible in the graph and refused at the
   * bridge rather than trusted to the code.
   *
   * Host-set only, like {@link allowPrivateNetwork}. A run reads its own scope
   * through `nodetool.secrets.list()` but cannot widen it, and an empty array
   * means no secret at all — a stricter thing than an absent scope, not a
   * looser one.
   */
  secretScope?: readonly string[] | null;
}

export type ResolvedSandboxLimits = Required<SandboxLimits>;

/**
 * Normalize a declared secret scope: a list of non-empty names, or `null` for
 * an unscoped run. An empty declared list stays empty — it denies everything.
 */
function resolveSecretScope(
  scope: readonly string[] | null | undefined
): readonly string[] | null {
  if (!Array.isArray(scope)) return null;
  return scope
    .filter((name): name is string => typeof name === "string" && name !== "")
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

function clampLimit(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}

/** Apply defaults and ceilings to a caller-supplied {@link SandboxLimits}. */
export function resolveSandboxLimits(
  limits?: SandboxLimits
): ResolvedSandboxLimits {
  return {
    maxFetchCalls: clampLimit(limits?.maxFetchCalls, MAX_FETCH_CALLS, 0, 100),
    maxResponseBodyBytes: clampLimit(
      limits?.maxResponseBodyBytes,
      MAX_RESPONSE_BODY_SIZE,
      1024,
      50 * 1024 * 1024
    ),
    maxOutputSize: clampLimit(
      limits?.maxOutputSize,
      MAX_OUTPUT_SIZE,
      1024,
      10 * 1024 * 1024
    ),
    memoryLimitBytes: clampLimit(
      limits?.memoryLimitBytes,
      GUEST_MEMORY_LIMIT,
      1024 * 1024,
      512 * 1024 * 1024
    ),
    runMediaBytes: clampLimit(
      limits?.runMediaBytes,
      MAX_RUN_MEDIA_BYTES,
      1024 * 1024,
      2 * 1024 * 1024 * 1024
    ),
    stackLimitBytes: clampLimit(
      limits?.stackLimitBytes,
      GUEST_STACK_LIMIT,
      16 * 1024,
      8 * 1024 * 1024
    ),
    fetchTimeoutMs: clampLimit(
      limits?.fetchTimeoutMs,
      FETCH_TIMEOUT_MS,
      100,
      120_000
    ),
    // Not clamped — these are capability switches, not magnitudes. Both
    // resolve to the restrictive value unless the host explicitly opts out.
    allowPrivateNetwork: limits?.allowPrivateNetwork === true,
    userAgent: limits?.userAgent ?? "",
    filesystemAccess:
      limits?.filesystemAccess === "host" ? "host" : "workspace",
    secretScope: resolveSecretScope(limits?.secretScope)
  };
}

// ---------------------------------------------------------------------------
// Engine bootstrap — one WASM module shared by every invocation.
// ---------------------------------------------------------------------------

let enginePromise: ReturnType<typeof loadQuickJs> | null = null;

function getEngine(): ReturnType<typeof loadQuickJs> {
  registerTypedArraySerializers();
  if (!enginePromise) {
    enginePromise = loadQuickJs(quickJsVariant);
  }
  return enginePromise;
}

/**
 * The guest engine can fail in two ways that never reach `runInSandbox`'s own
 * `await`, and both used to end the same way: the host process died, the tool
 * call it was serving returned *nothing*, and the agent driving it saw a turn
 * that simply stopped. A missing result is worse than any error — there is
 * nothing to read and nothing to retry.
 *
 * 1. An Emscripten `abort()` (the `list_empty(&rt->gc_obj_list)` assertion in
 *    `JS_FreeRuntime`) surfaces as a `RuntimeError` from the WASM module.
 * 2. A marshaling failure — most often guest OOM while a host return value is
 *    being written into the guest — throws inside a promise continuation the
 *    library created and never catches, so it lands as an unhandled rejection.
 *
 * `guardHostProcess` races the run against those escapes. A rejection that
 * looks like the engine's fails the run; anything else is re-thrown on the next
 * tick so a genuine host bug still crashes the way it should.
 */
function isEngineFailure(error: unknown): boolean {
  const name = (error as Error)?.constructor?.name ?? "";
  const message = String((error as Error)?.message ?? error);
  const stack = String((error as Error)?.stack ?? "");
  return (
    name.startsWith("QuickJS") ||
    message.includes("Assertion failed") ||
    message.includes("gc_obj_list") ||
    /\bAborted\(/.test(message) ||
    stack.includes("quickjs")
  );
}

/** The agent-facing translation of an engine failure. */
export function describeEngineFailure(error: unknown): string {
  const message = String((error as Error)?.message ?? error);
  if (/gc_obj_list|Assertion failed|\bAborted\(/.test(message)) {
    return (
      "The JavaScript sandbox runtime aborted while cleaning up, so this " +
      "action produced no result. It is usually triggered by moving a large " +
      "amount of binary data across the sandbox boundary in one run. Retry " +
      "with smaller pieces — process one image at a time, or hand large " +
      "payloads between steps as assets instead of as bytes."
    );
  }
  if (/out of memory/i.test(message)) {
    return (
      "The JavaScript sandbox ran out of guest memory, so this action " +
      "produced no result. Retry with less data held live at once."
    );
  }
  return message;
}

async function guardHostProcess<T>(run: Promise<T>): Promise<T> {
  // `process` is a Node global; the browser bundle (the in-process fallback
  // path there) has none, and there is no host process to guard against an
  // engine abort escaping as an unhandled rejection anyway.
  const nodeProcess = (globalThis as { process?: NodeJS.Process }).process;
  if (!nodeProcess?.on || !nodeProcess?.off) {
    return run;
  }
  let onRejection: ((reason: unknown) => void) | undefined;
  const escaped = new Promise<never>((_resolve, reject) => {
    onRejection = (reason: unknown) => {
      if (isEngineFailure(reason)) {
        reject(reason instanceof Error ? reason : new Error(String(reason)));
        return;
      }
      // Not ours. Restore the default "unhandled rejection crashes the
      // process" behaviour rather than silently swallowing someone's bug.
      setImmediate(() => {
        throw reason;
      });
    };
    nodeProcess.on("unhandledRejection", onRejection);
  });
  try {
    return await Promise.race([run, escaped]);
  } finally {
    if (onRejection) nodeProcess.off("unhandledRejection", onRejection);
    // The loser of the race stays pending forever; make sure neither promise
    // can later re-trigger the default handler.
    void escaped.catch(() => {});
    void run.then?.(
      () => {},
      () => {}
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n...[truncated]";
}

/**
 * Load `node:fs/promises` via a bundler-hidden import so a browser/edge bundle
 * never tries to resolve it. The `workspace.*` bridge is wired only when a
 * `ProcessingContext` is present, and these loaders run only when guest code
 * actually calls `workspace.read/write/list` — off-Node that path throws
 * (`importNodeBuiltin` resolves `null`), which `neverReject` surfaces to the
 * guest as a normal error.
 */
async function loadFsPromises(): Promise<typeof import("node:fs/promises")> {
  const fs =
    await importNodeBuiltin<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
  if (!fs) throw new Error("workspace file access requires a Node.js runtime");
  return fs;
}

async function loadNodePath(): Promise<typeof import("node:path")> {
  const nodePath =
    await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!nodePath) {
    throw new Error("workspace file access requires a Node.js runtime");
  }
  return nodePath;
}

/**
 * Verify a workspace path's real (symlink-resolved) location stays within the
 * real workspace root before an fs operation. resolveWorkspacePath only checks
 * containment lexically, so an in-workspace symlink pointing outside the root
 * would otherwise be dereferenced (arbitrary host file read/write). For a write
 * to a not-yet-existing file, the parent directory is checked instead. Throws
 * on an escape.
 *
 * TOCTOU: the realpath check and the fs op that follows it are separate awaits,
 * and guest bridge calls run concurrently (Promise.all), so an in-workspace
 * symlink could be swapped to point outside between this check and the caller's
 * read/write. Keeping this the last step before the op narrows the window but
 * does not close it — a full fix needs fd-based ops (O_NOFOLLOW / openat), which
 * node:fs/promises does not expose. Accepted as low-risk: it needs a local
 * attacker racing a symlink swap inside the workspace, and both surfaces here
 * (Code node, CodeAct actions) run first-party or already-trusted code.
 */
async function assertWorkspaceContained(
  context: { resolveWorkspacePath: (p: string) => string },
  fs: typeof import("node:fs/promises"),
  nodePath: typeof import("node:path"),
  fullPath: string,
  isWrite: boolean
): Promise<void> {
  const within = async (root: string, candidate: string): Promise<boolean> => {
    try {
      const realRoot = await fs.realpath(root);
      const realCandidate = await fs.realpath(candidate);
      if (realRoot === realCandidate) return true;
      const rel = nodePath.relative(realRoot, realCandidate);
      return rel !== "" && !rel.startsWith("..") && !nodePath.isAbsolute(rel);
    } catch {
      return false;
    }
  };
  const root = context.resolveWorkspacePath(".");
  if (await within(root, fullPath)) return;
  if (isWrite) {
    // Target may not exist yet — lstat detects a dangling symlink entry, and
    // otherwise the nearest existing ancestor must be inside the workspace.
    // Walking up covers writes and mkdirs that create several levels at once;
    // path segments that don't exist yet cannot be symlinks, so nothing along
    // the way can redirect the write.
    try {
      await fs.lstat(fullPath);
      // Exists (real file or symlink) but failed containment → outside root.
    } catch {
      let dir = nodePath.dirname(fullPath);
      for (;;) {
        let exists = true;
        try {
          await fs.lstat(dir);
        } catch {
          exists = false;
        }
        if (exists) {
          if (await within(root, dir)) return;
          break;
        }
        const parent = nodePath.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
  }
  throw new Error(`workspace path resolves outside the workspace: ${fullPath}`);
}

export type SandboxMediaModule = typeof import("./sandbox-media.js");
export type SandboxAvMediaModule = typeof import("./sandbox-av-media.js");

/**
 * The media engine behind the `image` and `canvas` bridges. Loaded on first
 * use like the host modules, and for the same reasons — the canvas backend
 * (Skia on Node) is heavy, and nothing that never draws should pay for it.
 * Unlike those, the import is intra-package, so every bundler resolves it.
 */
async function loadSandboxMedia(): Promise<SandboxMediaModule> {
  return import("./sandbox-media.js");
}

/** Audio/video adapters are loaded only when a run uses those namespaces. */
async function loadSandboxAvMedia(): Promise<SandboxAvMediaModule> {
  return import("./sandbox-av-media.js");
}

/** True if the first two octets of an IPv4 address fall in a blocked range. */
function isBlockedV4(a: number, b: number): boolean {
  if (a === 127 || a === 10 || a === 0) return true; // loopback, private, this-host
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 192 && b === 168) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  return false;
}

/**
 * Expand an IPv6 literal (hex form, `::` allowed) to its eight 16-bit hextets.
 * Returns null when the input is not a well-formed pure-hex IPv6 address —
 * dotted-quad tails are handled by the caller's IPv4 path, not here.
 */
function expandIpv6(h: string): number[] | null {
  if (!h.includes(":")) return null;
  const parts = h.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail =
    parts.length === 2 ? (parts[1] ? parts[1].split(":") : []) : null;
  let hextets: string[];
  if (tail === null) {
    hextets = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    hextets = [...head, ...new Array<string>(missing).fill("0"), ...tail];
  }
  if (hextets.length !== 8) return null;
  const nums = hextets.map((x) => parseInt(x || "0", 16));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

/**
 * Extract the first two octets of an IPv4 address embedded in a hex-serialized
 * IPv6 literal — the WHATWG URL parser rewrites `::ffff:127.0.0.1` to
 * `::ffff:7f00:1`, so the dotted regex no longer matches. Covers IPv4-mapped
 * (`::ffff:x:x`, incl. the full `0:0:0:0:0:ffff:x:x`), IPv4-compatible
 * (`::a.b.c.d`, deprecated) and NAT64 (`64:ff9b::/96`). Returns null when no
 * embedded v4 is present.
 */
function embeddedV4FromHexIpv6(h: string): [number, number] | null {
  const nums = expandIpv6(h);
  if (!nums) return null;
  const isZero = (from: number, to: number): boolean =>
    nums.slice(from, to).every((n) => n === 0);
  const octets = (): [number, number] => [
    (nums[6] >> 8) & 0xff,
    nums[6] & 0xff
  ];
  if (isZero(0, 5) && nums[5] === 0xffff) return octets(); // ::ffff:a.b.c.d
  if (isZero(0, 6)) return octets(); // ::a.b.c.d (IPv4-compatible, deprecated)
  if (nums[0] === 0x64 && nums[1] === 0xff9b && isZero(2, 6)) return octets(); // 64:ff9b::/96
  return null;
}

/** True if a literal IPv4/IPv6 host is loopback, link-local, or private. */
function isBlockedIpLiteral(host: string): boolean {
  // Strip IPv6 brackets/zone id.
  const h = host
    .replace(/^\[|\]$/g, "")
    .split("%")[0]
    .toLowerCase();
  // IPv4, dotted form (incl. an IPv4-mapped IPv6 tail like ::ffff:127.0.0.1).
  const v4 = h.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4) {
    const [a, b] = v4[1].split(".").map(Number);
    return isBlockedV4(a, b);
  }
  // IPv4 embedded in a hex-serialized IPv6 literal — ::ffff:7f00:1 (mapped) and
  // 64:ff9b::a9fe:a9fe (NAT64). These match neither the v4 regex nor the plain
  // IPv6 checks below, so without this an ::ffff:169.254.169.254 metadata fetch
  // slips through.
  const embedded = embeddedV4FromHexIpv6(h);
  if (embedded) return isBlockedV4(embedded[0], embedded[1]);
  // Plain IPv6.
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  // Link-local fe80::/10 spans fe80::–febf::, so the first three hex digits are
  // fe8/fe9/fea/feb — "fe80" alone is too narrow.
  if (/^fe[89ab]/.test(h)) return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local fc00::/7
  return false;
}

/**
 * SSRF allow-check for the sandbox fetch bridge. Rejects non-http(s) schemes
 * and hosts that resolve to loopback/link-local/private literals or localhost.
 * Throws on a blocked URL.
 */
function assertFetchUrlAllowed(url: string, allowPrivate = false): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("fetch: invalid URL");
  }
  // Scheme is checked even in private-network mode: `file:`, `gopher:` and
  // friends are never reachable through the bridge, whatever the host allows.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`fetch: unsupported scheme "${parsed.protocol}"`);
  }
  if (allowPrivate) return;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("fetch: access to localhost is blocked");
  }
  if (isBlockedIpLiteral(host)) {
    throw new Error(
      `fetch: access to internal/private address "${host}" is blocked`
    );
  }
}

/**
 * Read a fetch Response body into a Uint8Array bounded by `maxBytes`. Aborts the
 * transfer via `controller` once the cap is exceeded so an oversized/fast
 * response cannot buffer unbounded host memory.
 */
async function readBodyCapped(
  response: {
    body: ReadableStream<Uint8Array> | null;
    arrayBuffer: () => Promise<ArrayBuffer>;
  },
  controller: AbortController,
  maxBytes: number
): Promise<Uint8Array> {
  if (!response.body) {
    // No stream (e.g. empty body) — fall back, then clamp.
    const buf = new Uint8Array(await response.arrayBuffer());
    return buf.length > maxBytes ? buf.slice(0, maxBytes) : buf;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
      if (total >= maxBytes) {
        controller.abort();
        break;
      }
    }
  } catch {
    // Aborted or network error mid-read — return what we have.
  }
  const out = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    if (offset >= out.length) break;
    const take = Math.min(c.byteLength, out.length - offset);
    out.set(c.subarray(0, take), offset);
    offset += take;
  }
  return out;
}

function formatArg(arg: unknown): string {
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (isString(arg)) return arg;
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

function isTypedArray(value: unknown): boolean {
  if (!isObjectLike(value)) return false;
  const name = (value as object).constructor?.name;
  return (
    name === "Uint8Array" ||
    name === "Buffer" ||
    name === "Int8Array" ||
    name === "Uint8ClampedArray" ||
    name === "Int16Array" ||
    name === "Uint16Array" ||
    name === "Int32Array" ||
    name === "Uint32Array" ||
    name === "Float32Array" ||
    name === "Float64Array" ||
    name === "ArrayBuffer"
  );
}

function toNativeUint8Array(value: unknown): Uint8Array<ArrayBuffer> {
  const v = value as {
    length?: number;
    byteLength?: number;
    [i: number]: number;
  };
  const len = v.length ?? v.byteLength ?? 0;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = v[i] ?? 0;
  return arr;
}

const DIGEST_ALGORITHMS: Record<string, string> = {
  "SHA-1": "SHA-1",
  SHA1: "SHA-1",
  "SHA-256": "SHA-256",
  SHA256: "SHA-256",
  "SHA-384": "SHA-384",
  SHA384: "SHA-384",
  "SHA-512": "SHA-512",
  SHA512: "SHA-512"
};

function normalizeDigestAlgorithm(algorithm: unknown): string {
  const key = String(algorithm ?? "")
    .trim()
    .toUpperCase();
  const resolved = DIGEST_ALGORITHMS[key];
  if (!resolved) {
    throw new Error(
      `crypto: unsupported algorithm "${String(algorithm)}" (use SHA-1, SHA-256, SHA-384 or SHA-512)`
    );
  }
  return resolved;
}

/** Accept a guest string or byte-like value as host bytes. */
function coerceBytesInput(
  value: unknown,
  label: string
): Uint8Array<ArrayBuffer> {
  if (isString(value)) return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (isTypedArray(value)) return toNativeUint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value.map(Number));
  if (isObjectLike(value) && isNumber((value as { length?: unknown }).length)) {
    return toNativeUint8Array(value);
  }
  throw new Error(`crypto: ${label} must be a string or Uint8Array`);
}

function webCryptoSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("crypto: WebCrypto (crypto.subtle) is not available");
  }
  return subtle;
}

/** Depth ceiling for the binary-preserving walk — guards pathological nesting. */
const SERIALIZE_MAX_DEPTH = 32;

/**
 * True if a typed array sits anywhere inside `value`. Cycle-safe: a revisited
 * object reports false, which drops the value onto the JSON path, where
 * `JSON.stringify` throws on the cycle and the caller falls back to `String` —
 * the behavior cyclic values already had.
 */
function containsTypedArray(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>()
): boolean {
  if (isTypedArray(value)) return true;
  if (!isObjectLike(value)) return false;
  if (depth >= SERIALIZE_MAX_DEPTH) return false;
  const obj = value as object;
  if (seen.has(obj)) return false;
  seen.add(obj);
  const values = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  return values.some((v) => containsTypedArray(v, depth + 1, seen));
}

/**
 * Rebuild `value`, converting every typed array at any depth to a native
 * Uint8Array and leaving everything else structurally intact.
 */
function convertTypedArraysDeep(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>()
): unknown {
  if (isTypedArray(value)) return toNativeUint8Array(value);
  if (!isObjectLike(value)) return value;
  if (depth >= SERIALIZE_MAX_DEPTH) return value;
  const obj = value as object;
  if (seen.has(obj)) return null;
  seen.add(obj);
  if (Array.isArray(value)) {
    return value.map((v) => convertTypedArraysDeep(v, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = convertTypedArraysDeep(v, depth + 1, seen);
  }
  return out;
}

/**
 * Recursively serialize a value returned from the sandbox, converting typed
 * arrays to native Uint8Array and enforcing output size limits.
 */
export function serializeResult(
  result: unknown,
  maxOutputSize: number = MAX_OUTPUT_SIZE
) {
  if (result === undefined) return null;
  if (result === null) return null;
  if (isString(result) || isNumber(result) || isBoolean(result)) {
    if (isString(result) && result.length > maxOutputSize) {
      return truncate(result, maxOutputSize);
    }
    return result;
  }
  if (isTypedArray(result)) {
    return toNativeUint8Array(result);
  }
  if (isObjectLike(result)) {
    // The scan and the rebuild are both deep. They used to look one level in,
    // so a typed array nested any deeper fell through to the JSON path below —
    // and `JSON.stringify(new Uint8Array([137, 80]))` is `{"0":137,"1":80}`,
    // which is lossy and indistinguishable from a user's own integer map. The
    // streaming path hit this every time: `genProcess` returns an array of
    // yielded objects, so the bytes are always at depth 2.
    if (containsTypedArray(result)) {
      return convertTypedArraysDeep(result);
    }
    try {
      const json = JSON.stringify(result);
      if (json.length > maxOutputSize) {
        return truncate(json, maxOutputSize);
      }
      return JSON.parse(json);
    } catch {
      return String(result);
    }
  }
  return String(result);
}

/**
 * Trim engine/library frames from a stack trace so the user sees only their
 * own code. Keeps QuickJS frames (`user-code`, `<evalScript>`, `<anonymous>`)
 * and legacy Node frames (`evalmachine`, `agent-js`).
 */
export function cleanStack(stack: string): string {
  return stack
    .split("\n")
    .filter((line) => {
      if (
        line.includes("user-code") ||
        line.includes("<evalScript>") ||
        line.includes("agent-js") ||
        line.includes("evalmachine")
      ) {
        return true;
      }
      if (line.includes("node:") || line.includes("node_modules")) return false;
      return true;
    })
    .slice(0, 5)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Sandbox builder — returns the record of host-side bindings that will be
// exposed in the guest.
// ---------------------------------------------------------------------------

export interface SandboxResult {
  sandbox: Record<string, unknown>;
  getLogs: () => string[];
  /**
   * The final values guest `output(name, value)` calls recorded, or `undefined`
   * when the guest called `output` never.
   */
  getOutputs: () => Record<string, unknown> | undefined;
  /**
   * Values guest `emit` calls produced while no host sink was set, in call
   * order. `undefined` when a sink consumed them or nothing was emitted.
   */
  getEmitted: () => SandboxEmittedValue[] | undefined;
}

/**
 * Build a sandbox descriptor: a record of host-side bindings plus a `getLogs`
 * closure that retrieves captured console output. `runInSandbox` feeds this
 * record into a QuickJS context via `expose()`.
 *
 * @param context  Optional ProcessingContext — when provided, enables
 *                 `workspace.*` and `getSecret()` APIs.
 * @param signal   Optional external cancellation. Aborts in-flight host
 *                 operations and makes `sleep` return immediately.
 * @param limits   Optional per-invocation limit overrides, clamped by
 *                 {@link resolveSandboxLimits}.
 * @param onProgress Optional sink for guest `progress()` calls. Without one the
 *                 guest function is a no-op.
 * @param onEmit   Optional sink for guest `emit()` calls. Without one the values
 *                 are collected and handed back through `getEmitted`.
 * @param streams  Optional input bridges behind the guest `stream` global.
 *                 Without an `onTakeInput` every `stream` call throws
 *                 {@link NO_INPUT_STREAM_MESSAGE}.
 * @param resolveMediaRef Optional host loader for media refs when this run
 *                 has no ProcessingContext (chat). `image.*` uses it so a
 *                 generation result can go straight into the next op.
 */
export function buildSandbox(
  context?: ProcessingContext,
  signal?: AbortSignal,
  limits?: SandboxLimits,
  onProgress?: SandboxProgressCallback,
  onEmit?: SandboxEmitCallback,
  streams?: SandboxInputStreams,
  resolveMediaRef?: (where: string, ref: unknown) => Promise<Uint8Array>,
  promoteMedia?: (
    type: "image" | "audio" | "video",
    bytes: Uint8Array,
    options?: Record<string, unknown>
  ) => Promise<unknown>
): SandboxResult {
  const logs: string[] = [];
  const resolvedLimits = resolveSandboxLimits(limits);
  let fetchCount = 0;

  const console = {
    log: (...args: unknown[]) => {
      logs.push(args.map(formatArg).join(" "));
    },
    warn: (...args: unknown[]) => {
      logs.push("[warn] " + args.map(formatArg).join(" "));
    },
    error: (...args: unknown[]) => {
      logs.push("[error] " + args.map(formatArg).join(" "));
    },
    info: (...args: unknown[]) => {
      logs.push("[info] " + args.map(formatArg).join(" "));
    }
  };

  const sandboxedFetch = async (
    url: string,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    fetchCount++;
    if (fetchCount > resolvedLimits.maxFetchCalls) {
      throw new Error(
        `Fetch limit exceeded (max ${resolvedLimits.maxFetchCalls} requests per execution)`
      );
    }
    if (!isNonEmptyString(url)) {
      throw new Error("fetch: url must be a non-empty string");
    }
    // SSRF guard: untrusted guest code must not reach loopback, link-local
    // (incl. cloud metadata 169.254.169.254), or private ranges, nor non-http
    // schemes. Blocks the direct-literal attacks; DNS-rebinding is out of scope.
    // The host can waive the address check for a node that replaces a trusted
    // `lib.http` node; the scheme check is never waived.
    assertFetchUrlAllowed(url, resolvedLimits.allowPrivateNetwork);

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      resolvedLimits.fetchTimeoutMs
    );
    // Cancelling the run kills an in-flight request rather than waiting out
    // the per-request timeout.
    const onExternalAbort = (): void => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", onExternalAbort, { once: true });

    try {
      const fetchOptions: RequestInit = {
        method: (options?.method as string) ?? "GET",
        signal: controller.signal
      };

      const requestHeaders: Record<string, string> = {};
      // Host default first so a guest-set User-Agent still wins.
      if (resolvedLimits.userAgent) {
        requestHeaders["User-Agent"] = resolvedLimits.userAgent;
      }
      if (isObjectLike(options?.headers)) {
        Object.assign(
          requestHeaders,
          options.headers as Record<string, string>
        );
      }
      if (Object.keys(requestHeaders).length > 0) {
        fetchOptions.headers = requestHeaders;
      }
      if (options?.body !== undefined) {
        const body = options.body;
        if (isString(body)) {
          fetchOptions.body = body;
        } else if (isTypedArray(body)) {
          // Binary request body. A guest Uint8Array reaches the host as a
          // native one via the typed-array serializers, but normalize anyway
          // so a numeric-keyed object is sent as raw bytes, not as JSON.
          // SAFETY: `BodyInit`'s view member is pinned to a plain
          // ArrayBuffer; these bytes are copied out of the guest heap by
          // `toNativeUint8Array`, never off a SharedArrayBuffer.
          fetchOptions.body = toNativeUint8Array(body) as BodyInit;
        } else {
          fetchOptions.body = JSON.stringify(body);
        }
      }

      // Follow redirects manually on Node so the SSRF guard runs on every hop's
      // resolved Location, not just the initial URL — otherwise an allowed
      // public URL that 302s to http://169.254.169.254/ or an internal host
      // bypasses the guard entirely. In a browser redirect:"manual" yields an
      // opaque response whose Location is unreadable, and cross-origin bodies
      // are CORS-blocked anyway, so the browser keeps the single redirect:
      // "follow" call with only the already-run initial-URL check.
      const onNode = isString(globalThis.process?.versions?.node);
      let response: Response;
      if (!onNode) {
        response = await fetch(url, { ...fetchOptions, redirect: "follow" });
      } else {
        const dropContentHeaders = (
          h: Record<string, string>
        ) => {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(h)) {
            const lk = k.toLowerCase();
            if (lk === "content-length" || lk === "content-type") continue;
            out[k] = v;
          }
          return out;
        };
        // Credential headers must not cross to a different origin — this
        // mirrors Node's native redirect:"follow", which strips them per the
        // fetch spec. Guest code sets headers from getSecret(...), so a
        // redirect to an attacker origin would otherwise exfiltrate them.
        const dropSensitiveHeaders = (
          h: Record<string, string>
        ) => {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(h)) {
            const lk = k.toLowerCase();
            if (
              lk === "authorization" ||
              lk === "cookie" ||
              lk === "proxy-authorization"
            ) {
              continue;
            }
            out[k] = v;
          }
          return out;
        };
        let currentUrl = url;
        let method = fetchOptions.method ?? "GET";
        let body = fetchOptions.body;
        let headers: Record<string, string> = { ...requestHeaders };
        let hops = 0;
        for (;;) {
          response = await fetch(currentUrl, {
            ...fetchOptions,
            method,
            body,
            headers: Object.keys(headers).length ? headers : undefined,
            redirect: "manual"
          });
          const status = response.status;
          if (status < 300 || status >= 400) break;
          const location = response.headers.get("location");
          if (!location) break; // 3xx without Location — treat as final.
          if (hops++ >= MAX_FETCH_REDIRECTS) {
            throw new Error("fetch: too many redirects");
          }
          const nextUrl = new URL(location, currentUrl).toString();
          // Re-run the guard on the resolved target BEFORE the next request.
          assertFetchUrlAllowed(nextUrl, resolvedLimits.allowPrivateNetwork);
          // Strip credential headers on a cross-origin hop (origin includes
          // scheme, host and port); keep them on same-origin redirects.
          if (new URL(nextUrl).origin !== new URL(currentUrl).origin) {
            headers = dropSensitiveHeaders(headers);
          }
          // Method/body rewrite per the HTTP spec + browser behavior:
          // 303 always → GET; 301/302 on a non-GET/HEAD → GET (what browsers
          // do); 307/308 preserve method and body.
          if (
            status === 303 ||
            ((status === 301 || status === 302) &&
              method !== "GET" &&
              method !== "HEAD")
          ) {
            method = "GET";
            body = undefined;
            headers = dropContentHeaders(headers);
          }
          // Free the redirect response's socket before the next hop.
          await response.body?.cancel().catch(() => {});
          currentUrl = nextUrl;
        }
      }
      // Read the body under a hard byte cap so a large/fast response can't OOM
      // the shared host heap (the guest's 64MB WASM limit does not apply to
      // these host-side bytes). Aborts the transfer once the cap is exceeded.
      const rawBytes = await readBodyCapped(
        response,
        controller,
        resolvedLimits.maxResponseBodyBytes
      );
      const ok = response.ok;
      const status = response.status;
      const statusText = response.statusText;
      const headers = Object.fromEntries(response.headers.entries());

      let cachedText: string | null = null;
      const getText = (): string => {
        if (cachedText === null) {
          const decoded = new TextDecoder().decode(rawBytes);
          cachedText =
            decoded.length > resolvedLimits.maxResponseBodyBytes
              ? decoded.slice(0, resolvedLimits.maxResponseBodyBytes) +
                "...[truncated]"
              : decoded;
        }
        return cachedText;
      };

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(getText());
      } catch {
        parsedJson = undefined;
      }

      // Plain data only — no methods. A function in a bridge result cannot
      // cross the worker boundary (`postMessage` refuses it), so the guest
      // prelude's fetch wrapper builds `text()`/`bytes()`/`arrayBuffer()` over
      // these fields instead. The body is already fully buffered and capped
      // here, so shipping it eagerly costs no extra read.
      return {
        ok,
        status,
        statusText,
        headers,
        body: getText(),
        json: parsedJson,
        bodyBytes: toGuestBytes(rawBytes)
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onExternalAbort);
    }
  };

  // WebCrypto exists in both Node >= 20 and browsers, so no node:crypto import
  // is needed and the sandbox stays browser-safe. `getRandomValues` is the one
  // synchronous member: it clamps instead of throwing, since a host throw does
  // not go through the never-reject convention.
  const sandboxCrypto = {
    randomUUID: (): string => globalThis.crypto.randomUUID(),
    getRandomValues: (length: number): Record<string, string> => {
      const requested = Number(length);
      const size = Number.isFinite(requested)
        ? Math.min(Math.max(Math.floor(requested), 0), MAX_RANDOM_BYTES)
        : 0;
      const bytes = new Uint8Array(size);
      if (size > 0) globalThis.crypto.getRandomValues(bytes);
      return toGuestBytes(bytes);
    },
    digest: async (algorithm: string, data: unknown): Promise<GuestBytes> => {
      const algo = normalizeDigestAlgorithm(algorithm);
      const bytes = coerceBytesInput(data, "data");
      const digest = await webCryptoSubtle().digest(algo, bytes);
      return toGuestBytes(new Uint8Array(digest));
    },
    hmac: async (
      algorithm: string,
      key: unknown,
      data: unknown
    ): Promise<GuestBytes> => {
      const algo = normalizeDigestAlgorithm(algorithm);
      const keyBytes = coerceBytesInput(key, "key");
      const dataBytes = coerceBytesInput(data, "data");
      const subtle = webCryptoSubtle();
      const cryptoKey = await subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: algo },
        false,
        ["sign"]
      );
      const signature = await subtle.sign("HMAC", cryptoKey, dataBytes);
      return toGuestBytes(new Uint8Array(signature));
    }
  };

  /**
   * The one place a secret leaves the host.
   *
   * The scope check sits here rather than in the guest prelude because a
   * prelude is guest code: it can be shadowed, and a check the guest could
   * remove is documentation, not a boundary. `nodetool.secrets.get` and the
   * bare `getSecret` global both land here, so there is no second route.
   */
  const secretScope = resolvedLimits.secretScope;
  const assertSecretInScope = (name: string): void => {
    if (secretScope === null) return;
    if (secretScope.includes(name)) return;
    throw new Error(
      secretScope.length === 0
        ? `getSecret("${name}"): this node declares no secrets, so it can read none`
        : `getSecret("${name}"): this node may read only ${secretScope
            .map((allowed) => `"${allowed}"`)
            .join(", ")}`
    );
  };

  const getSecret = context
    ? async (name: string): Promise<string | undefined> => {
        assertSecretInScope(name);
        return (await context.getSecret(name)) ?? undefined;
      }
    : async (name: string): Promise<string | undefined> => {
        assertSecretInScope(name);
        return undefined;
      };

  /**
   * Resolve a guest path under the configured filesystem scope.
   *
   * `"workspace"` (the default) is the pre-existing behavior: resolve against
   * the workspace root, then verify the symlink-resolved location is still
   * inside it. `"host"` skips containment and expands `~`, matching what the
   * `lib.os` nodes have always done. Host mode is reachable only when the host
   * passes `filesystemAccess: "host"` — guest code cannot ask for it.
   */
  const resolveGuestPath = async (
    ctx: ProcessingContext,
    path: string,
    isWrite: boolean
  ): Promise<string> => {
    const nodePath = await loadNodePath();
    if (resolvedLimits.filesystemAccess === "host") {
      const os = await importNodeBuiltin<typeof import("node:os")>("node:os");
      if (!os) {
        throw new Error("host filesystem access requires a Node.js runtime");
      }
      const expanded =
        path === "~"
          ? os.homedir()
          : path.startsWith("~/")
            ? nodePath.join(os.homedir(), path.slice(2))
            : path;
      return nodePath.resolve(expanded);
    }
    const fullPath = ctx.resolveWorkspacePath(path);
    const fs = await loadFsPromises();
    await assertWorkspaceContained(ctx, fs, nodePath, fullPath, isWrite);
    return fullPath;
  };

  const workspace = context
    ? {
        read: async (path: string): Promise<string> => {
          const fs = await loadFsPromises();
          const fullPath = await resolveGuestPath(context, path, false);
          return fs.readFile(fullPath, "utf-8");
        },
        write: async (path: string, content: string): Promise<void> => {
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          const fullPath = await resolveGuestPath(context, path, true);
          await fs.mkdir(nodePath.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content, "utf-8");
        },
        list: async (path: string): Promise<string[]> => {
          const fs = await loadFsPromises();
          const fullPath = await resolveGuestPath(context, path, false);
          return fs.readdir(fullPath);
        },
        readBytes: async (path: string): Promise<Record<string, string>> => {
          const fs = await loadFsPromises();
          const fullPath = await resolveGuestPath(context, path, false);
          return toGuestBytes(new Uint8Array(await fs.readFile(fullPath)));
        },
        writeBytes: async (path: string, data: unknown): Promise<void> => {
          const bytes =
            data instanceof Uint8Array ? data : toNativeUint8Array(data);
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          const fullPath = await resolveGuestPath(context, path, true);
          await fs.mkdir(nodePath.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, bytes);
        },
        // A missing path is an answer, not a failure: guest code asking
        // "does this exist?" should not have to wrap the call in try/catch.
        // `lstat` (not `stat`) so a symlink reports as itself rather than as
        // whatever it points at.
        stat: async (path: string): Promise<Record<string, unknown>> => {
          const fs = await loadFsPromises();
          // Resolved as a write, not a read: the queried path may legitimately
          // not exist, and the read path resolves it with `realpath`, which
          // throws on a missing file and so would report every absent path as
          // an escape. The write path decides containment from the nearest
          // existing ancestor instead. A path that *does* exist is still
          // realpath-checked, so a symlink out of the workspace is caught.
          const fullPath = await resolveGuestPath(context, path, true);
          let info;
          try {
            info = await fs.lstat(fullPath);
          } catch {
            return {
              exists: false,
              size: 0,
              isDirectory: false,
              isFile: false,
              isSymlink: false,
              modifiedMs: 0,
              createdMs: 0,
              accessedMs: 0
            };
          }
          return {
            exists: true,
            size: info.size,
            isDirectory: info.isDirectory(),
            isFile: info.isFile(),
            isSymlink: info.isSymbolicLink(),
            modifiedMs: info.mtimeMs,
            createdMs: info.birthtimeMs,
            accessedMs: info.atimeMs
          };
        },
        /** Absolute path of the workspace root — the base for relative paths. */
        root: async (): Promise<string> => {
          return context.resolveWorkspacePath(".");
        },
        copy: async (src: string, dest: string): Promise<void> => {
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          // Source is a read, destination is a write — the asymmetry matters:
          // a write target may not exist yet, so it is checked via its nearest
          // existing ancestor.
          const fullSrc = await resolveGuestPath(context, src, false);
          const fullDest = await resolveGuestPath(context, dest, true);
          await fs.mkdir(nodePath.dirname(fullDest), { recursive: true });
          await fs.copyFile(fullSrc, fullDest);
        },
        move: async (src: string, dest: string): Promise<void> => {
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          // A move unlinks the source, so it is a write on both ends.
          const fullSrc = await resolveGuestPath(context, src, true);
          const fullDest = await resolveGuestPath(context, dest, true);
          await fs.mkdir(nodePath.dirname(fullDest), { recursive: true });
          await fs.rename(fullSrc, fullDest);
        },
        mkdir: async (path: string): Promise<void> => {
          const fs = await loadFsPromises();
          const fullPath = await resolveGuestPath(context, path, true);
          await fs.mkdir(fullPath, { recursive: true });
        },
        remove: async (path: string): Promise<void> => {
          const fs = await loadFsPromises();
          // Resolved as a write. `recursive: false` keeps this to one file or
          // one empty directory — guest code cannot delete a whole subtree in
          // a single call, in either filesystem mode.
          const fullPath = await resolveGuestPath(context, path, true);
          const info = await fs.lstat(fullPath);
          if (info.isDirectory()) {
            // rmdir refuses a non-empty directory, which is the point.
            await fs.rmdir(fullPath);
          } else {
            await fs.rm(fullPath, { recursive: false });
          }
        }
      }
    : {
        read: async (_path: string): Promise<string> => {
          throw new Error("workspace.read is not available without a context");
        },
        write: async (_path: string, _content: string): Promise<void> => {
          throw new Error("workspace.write is not available without a context");
        },
        list: async (_path: string): Promise<string[]> => {
          throw new Error("workspace.list is not available without a context");
        },
        readBytes: async (_path: string): Promise<Record<string, string>> => {
          throw new Error(
            "workspace.readBytes is not available without a context"
          );
        },
        writeBytes: async (_path: string, _data: unknown): Promise<void> => {
          throw new Error(
            "workspace.writeBytes is not available without a context"
          );
        },
        stat: async (_path: string): Promise<Record<string, unknown>> => {
          throw new Error("workspace.stat is not available without a context");
        },
        root: async (): Promise<string> => {
          throw new Error("workspace.root is not available without a context");
        },
        copy: async (_src: string, _dest: string): Promise<void> => {
          throw new Error("workspace.copy is not available without a context");
        },
        move: async (_src: string, _dest: string): Promise<void> => {
          throw new Error("workspace.move is not available without a context");
        },
        mkdir: async (_path: string): Promise<void> => {
          throw new Error("workspace.mkdir is not available without a context");
        },
        remove: async (_path: string): Promise<void> => {
          throw new Error(
            "workspace.remove is not available without a context"
          );
        }
      };

  const sleep = (ms: number): Promise<void> => {
    const capped = Math.min(ms, 5000);
    // Resolve immediately on cancellation: a sleeping script is the common
    // case for "still running after Stop", and waiting out the nap before the
    // next bridge call can reject it wastes up to 5s per sleep.
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, capped);
      function onAbort(): void {
        clearTimeout(timer);
        resolve();
      }
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  };

  const assetToSandbox = context
    ? async (assetId: string, path: string): Promise<string> => {
        return context.assetToSandbox(assetId, path);
      }
    : async (_assetId: string, _path: string): Promise<string> => {
        throw new Error("assetToSandbox is not available without a context");
      };

  const sandboxToAsset = context
    ? async (path: string): Promise<AssetRef> => {
        return context.sandboxToAsset(path);
      }
    : async (_path: string): Promise<AssetRef> => {
        throw new Error("sandboxToAsset is not available without a context");
      };

  // Fire-and-forget progress reporting. Synchronous like console.log: it never
  // throws, so it needs no never-reject wrapper. A guest that spams it cannot
  // flood the host — reports closer together than PROGRESS_MIN_INTERVAL_MS are
  // dropped, and the run has a lifetime cap.
  let progressCalls = 0;
  let lastProgressAt = 0;
  const progress = (percent: number, message?: string): void => {
    if (!onProgress || signal?.aborted) return;
    if (progressCalls >= MAX_PROGRESS_CALLS) return;
    const now = Date.now();
    if (progressCalls > 0 && now - lastProgressAt < PROGRESS_MIN_INTERVAL_MS) {
      return;
    }
    const raw = Number(percent);
    const clamped = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 100) : 0;
    const text =
      message === undefined || message === null
        ? undefined
        : String(message).slice(0, MAX_PROGRESS_MESSAGE_CHARS);
    progressCalls++;
    lastProgressAt = now;
    try {
      onProgress(clamped, text);
    } catch {
      // A failing host sink must not take the guest run down with it.
    }
  };

  // Output delivery. The opposite of `progress` in every respect: awaitable, so
  // the guest gets backpressure from a slow consumer, and never rate-limited or
  // dropped — an output value the host silently discards is data loss, not a
  // missed progress tick. Both throw into the guest rather than failing quietly.
  let emitCalls = 0;
  const emitted: SandboxEmittedValue[] = [];
  const outputs = new Map<string, unknown>();

  const handleName = (fn: string, name: unknown): string => {
    if (!isString(name)) {
      throw new TypeError(`${fn}: name must be a string`);
    }
    return name;
  };

  const emit = async (name: unknown, value: unknown): Promise<void> => {
    const handle = handleName("emit", name);
    if (emitCalls >= MAX_EMIT_CALLS) {
      throw new Error(
        `emit: this run may emit at most ${MAX_EMIT_CALLS} values (MAX_EMIT_CALLS)`
      );
    }
    emitCalls++;
    const marshaled = serializeResult(value, resolvedLimits.maxOutputSize);
    if (onEmit) {
      // Awaited, so the guest's promise resolves only once the host has taken
      // the value — and a sink that throws unwinds the guest's `emit` call.
      await onEmit(handle, marshaled);
      return;
    }
    emitted.push({ name: handle, value: marshaled });
  };

  const output = async (name: unknown, value: unknown): Promise<void> => {
    const handle = handleName("output", name);
    if (outputs.has(handle)) {
      throw new Error(`output "${handle}" was already set`);
    }
    outputs.set(handle, serializeResult(value, resolvedLimits.maxOutputSize));
  };

  // Input delivery, the mirror of `emit`: the guest pulls one value at a time
  // and the host answers from the inbox it owns. Backpressure is free — an item
  // nobody asked for stays upstream.
  const takeInput = async (name: unknown): Promise<SandboxInputTake> => {
    if (!streams?.onTakeInput) {
      throw new Error(NO_INPUT_STREAM_MESSAGE);
    }
    if (name !== null && !isString(name)) {
      throw new TypeError("stream: name must be a string");
    }
    // Waiting on upstream is not the guest executing, so it must not spend the
    // guest's timeout budget. The clock stops until the value (or EOS) lands.
    const resume = streams.clock?.suspend();
    try {
      const take = await streams.onTakeInput(name);
      if (take.done) return { done: true };
      return {
        done: false,
        handle: take.handle,
        value: toGuestBytesDeep(take.value)
      };
    } finally {
      resume?.();
    }
  };

  // Synchronous and never throwing, which is what lets the guest read it as a
  // plain boolean: an awaitable answer would make `if (stream.open(h))` true on
  // a pending promise. `null` is the one non-answer — this run has no input
  // stream at all — and the prelude turns it into the thrown error.
  const streamOpen = (name: unknown): boolean | null => {
    if (!streams?.onTakeInput) return null;
    if (!isString(name) || !streams.onStreamOpen) return false;
    try {
      return streams.onStreamOpen(name) === true;
    } catch {
      // A host probe that throws answers "closed" rather than taking the run
      // down: the take itself is where a broken inbox must surface.
      return false;
    }
  };

  // QuickJS ships no Intl, so locale-aware formatting has to come from the
  // host. Async + never-reject like the other bridges: a bad locale or option
  // surfaces in the guest as a thrown Error with Intl's own message.
  const format = {
    number: async (
      value: number,
      options?: Record<string, unknown>
    ): Promise<string> => {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        throw new Error("format.number: value must be a finite number");
      }
      const opts = options ?? {};
      return new Intl.NumberFormat(
        (opts.locale as string) ?? DEFAULT_FORMAT_LOCALE,
        {
          style: opts.style as Intl.NumberFormatOptions["style"],
          currency: opts.currency as string | undefined,
          minimumFractionDigits: opts.minimumFractionDigits as
            | number
            | undefined,
          maximumFractionDigits: opts.maximumFractionDigits as
            | number
            | undefined,
          useGrouping: opts.useGrouping as boolean | undefined
        }
      ).format(num);
    },
    date: async (
      epochMs: number,
      options?: Record<string, unknown>
    ): Promise<string> => {
      const ms = Number(epochMs);
      if (!Number.isFinite(ms)) {
        throw new Error(
          "format.date: epochMs must be a finite number of milliseconds"
        );
      }
      const opts = options ?? {};
      const dateStyle =
        opts.dateStyle as Intl.DateTimeFormatOptions["dateStyle"];
      const timeStyle =
        opts.timeStyle as Intl.DateTimeFormatOptions["timeStyle"];
      return new Intl.DateTimeFormat(
        (opts.locale as string) ?? DEFAULT_FORMAT_LOCALE,
        {
          // Intl falls back to a date-only default when neither style is given.
          dateStyle: dateStyle ?? (timeStyle ? undefined : "medium"),
          timeStyle,
          timeZone: opts.timeZone as string | undefined
        }
      ).format(new Date(ms));
    },
    relativeTime: async (
      value: number,
      unit: string,
      options?: Record<string, unknown>
    ): Promise<string> => {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        throw new Error("format.relativeTime: value must be a finite number");
      }
      const opts = options ?? {};
      return new Intl.RelativeTimeFormat(
        (opts.locale as string) ?? DEFAULT_FORMAT_LOCALE
      ).format(num, unit as Intl.RelativeTimeFormatUnit);
    },
    list: async (
      items: unknown,
      options?: Record<string, unknown>
    ): Promise<string> => {
      if (!Array.isArray(items)) {
        throw new Error("format.list: items must be an array of strings");
      }
      const opts = options ?? {};
      return new Intl.ListFormat(
        (opts.locale as string) ?? DEFAULT_FORMAT_LOCALE,
        { type: opts.type as Intl.ListFormatOptions["type"] }
      ).format(items.map((i) => String(i)));
    }
  };

  // Bytes media transforms produced and the guest only carries around. Lives for the
  // run, then goes; nothing here is durable until something promotes it.
  const mediaStore = createSandboxMediaStore(resolvedLimits.runMediaBytes);
  let runAvMediaPromise:
    | Promise<Pick<SandboxAvMediaModule, "audioOps" | "videoOps">>
    | undefined;
  const loadRunAvMedia = (): Promise<
    Pick<SandboxAvMediaModule, "audioOps" | "videoOps">
  > => {
    runAvMediaPromise ??= loadSandboxAvMedia().then((media) => ({
      audioOps: media.createAudioBridge(signal, resolvedLimits.runMediaBytes),
      videoOps: media.createVideoBridge(signal, resolvedLimits.runMediaBytes)
    }));
    return runAvMediaPromise;
  };

  // Media bridges. The engine (`sandbox-media.ts`) is imported on first use
  // like every other library-backed bridge, and picks its canvas backend from
  // the runtime — `@napi-rs/canvas` on Node, `OffscreenCanvas` in the browser
  // runner. Bytes come back tagged for the guest prelude to revive, so the
  // guest-visible API is `Uint8Array` in and `Uint8Array` out.
  const withGuestBytes = <A extends unknown[]>(
    fn: (...args: A) => Promise<unknown>
  ): ((...args: A) => Promise<unknown>) => {
    return async (...args: A) => toGuestBytesDeep(await fn(...args));
  };

  const mediaMember = <A extends unknown[]>(
    pick: (media: SandboxMediaModule) => (...args: A) => Promise<unknown>
  ): ((...args: A) => Promise<unknown>) =>
    withGuestBytes(async (...args: A) =>
      pick(await loadSandboxMedia())(...args)
    );

  // `image.*` trades in handles, not bytes. On the way in, every handle and
  // every media ref buried anywhere in the arguments is replaced by the bytes
  // it names — resolved host-side, so an `asset://` a generator produced goes
  // straight into the next operation without being pulled through the guest.
  // On the way out, encoded bytes become a handle instead of a base64 payload.
  // A chain (resize → adjust → composite) therefore moves nothing across the
  // boundary but small objects.
  //
  // `info` and `decode` are the deliberate exceptions: they exist to tell the
  // guest what is *in* an image, so their results stay plain data. `decode`
  // still hands over real pixels, which is the one call that has to.
  const loadMediaRef = async (
    where: string,
    value: unknown,
    maxBytes = resolvedLimits.runMediaBytes
  ): Promise<Uint8Array> => {
    const ref = remapMediaRef(value);
    if (context) {
      return resolveRefBytes(
        where,
        ref,
        context,
        (path: string) => resolveGuestPath(context, path, false),
        maxBytes
      );
    }
    if (resolveMediaRef) {
      const bytes = await resolveMediaRef(where, ref);
      if (bytes.length > maxBytes) {
        throw new Error(
          `${where}: media input is ${bytes.length} bytes, over the ` +
            `${maxBytes} byte remaining run media limit`
        );
      }
      return bytes;
    }
    const label = ref.uri || ref.asset_id || "this media ref";
    throw new Error(
      `${where}: cannot resolve ${label} in this run. Pass a media ` +
        `handle or a generation result (its asset_uri).`
    );
  };

  const resolveMediaArgs = async (
    where: string,
    value: unknown,
    // `image.*` wants a ref flattened to bytes it can operate on. `media.*`
    // takes refs *as* refs — that is its whole job — so it resolves handles
    // only, or `media.bytes(assetRef)` would be handed bytes and no longer
    // have a ref to read.
    resolveRefs: boolean,
    depth = 0,
    expectedType?: SandboxMediaType,
    budget = { used: 0 }
  ): Promise<unknown> => {
    if (depth >= SANDBOX_SERIALIZE_MAX_DEPTH) return value;
    const accountBytes = <T extends ArrayBufferView>(bytes: T): T => {
      if (bytes.byteLength > resolvedLimits.runMediaBytes - budget.used) {
        throw new Error(
          `${where}: aggregate media input exceeds the ` +
            `${resolvedLimits.runMediaBytes} byte run media limit`
        );
      }
      budget.used += bytes.byteLength;
      return bytes;
    };
    // Matched on the marker, not on store membership: a handle from an
    // earlier run must report *that*, rather than falling through to the ref
    // path and blaming the uri it happens to carry.
    if (isSandboxMediaHandle(value)) {
      const bytes = mediaStore.resolve(value, expectedType);
      if (!bytes) throw new Error(`${where}: media handle has no bytes`);
      return accountBytes(bytes);
    }
    if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
      return accountBytes(value);
    }
    if (Array.isArray(value)) {
      const resolved: unknown[] = [];
      for (const item of value) {
        const result = await resolveMediaArgs(
          where,
          item,
          resolveRefs,
          depth + 1,
          expectedType,
          budget
        );
        resolved.push(result);
      }
      return resolved;
    }
    if (resolveRefs && looksLikeMediaRef(value)) {
      if (expectedType && isObjectLike(value)) {
        const declared = value.type;
        if (
          (declared === "image" ||
            declared === "audio" ||
            declared === "video") &&
          declared !== expectedType
        ) {
          throw new Error(
            `${where}: expected ${expectedType} media, but received ${declared}`
          );
        }
      }
      const remainingBytes = resolvedLimits.runMediaBytes - budget.used;
      return accountBytes(await loadMediaRef(where, value, remainingBytes));
    }
    if (isObjectLike(value)) {
      const record = value;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(record)) {
        out[k] = await resolveMediaArgs(
          where,
          v,
          resolveRefs,
          depth + 1,
          expectedType,
          budget
        );
      }
      return out;
    }
    return value;
  };

  const defaultMediaMime = (type: SandboxMediaType): string =>
    type === "image"
      ? "image/png"
      : type === "audio"
        ? "audio/wav"
        : "video/mp4";

  const mediaMimeForValue = (
    value: unknown,
    expectedType: SandboxMediaType
  ): string => {
    if (isSandboxMediaHandle(value)) {
      return (
        mediaStore.entry(value, expectedType)?.mimeType ??
        defaultMediaMime(expectedType)
      );
    }
    const record = isRecord(value) ? value : undefined;
    const declared = record?.mimeType ?? record?.mime_type;
    const ref: MediaRefValue & { mimeType?: string } = remapMediaRef(value);
    if (isString(declared)) ref.mimeType = declared;
    return mimeForRef(ref, defaultMediaMime(expectedType));
  };

  const sniffMediaMime = (
    type: SandboxMediaType,
    bytes: Uint8Array,
    fallback: string
  ): string => {
    const ascii = (start: number, length: number): string =>
      String.fromCharCode(...bytes.subarray(start, start + length));
    if (type === "image") {
      if (bytes.length >= 8 && ascii(1, 3) === "PNG") return "image/png";
      if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8)
        return "image/jpeg";
      if (bytes.length >= 6 && ascii(0, 3) === "GIF") return "image/gif";
      if (
        bytes.length >= 12 &&
        ascii(0, 4) === "RIFF" &&
        ascii(8, 4) === "WEBP"
      )
        return "image/webp";
      return fallback;
    }
    if (type === "audio") {
      if (
        bytes.length >= 12 &&
        ascii(0, 4) === "RIFF" &&
        ascii(8, 4) === "WAVE"
      )
        return "audio/wav";
      if (bytes.length >= 4 && ascii(0, 4) === "fLaC") return "audio/flac";
      if (bytes.length >= 4 && ascii(0, 4) === "OggS") return "audio/ogg";
      if (
        (bytes.length >= 3 && ascii(0, 3) === "ID3") ||
        (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
      )
        return "audio/mpeg";
      if (bytes.length >= 12 && ascii(4, 4) === "ftyp") return "audio/mp4";
      return fallback;
    }
    if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "AVI ")
      return "video/x-msvideo";
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45) {
      return ascii(0, Math.min(bytes.length, 64)).includes("webm")
        ? "video/webm"
        : "video/x-matroska";
    }
    if (bytes.length >= 12 && ascii(4, 4) === "ftyp") {
      return ascii(8, 4) === "qt  " ? "video/quicktime" : "video/mp4";
    }
    return fallback;
  };

  /** An `image.*` op: handles/refs in, a handle out. */
  const imageMember = <A extends unknown[]>(
    name: string,
    pick: (media: SandboxMediaModule) => (...args: A) => Promise<unknown>
  ): ((...args: A) => Promise<unknown>) => {
    const where = `image.${name}`;
    return async (...args: A) => {
      const resolved = (await resolveMediaArgs(
        where,
        args,
        true,
        0,
        "image"
      )) as A;
      const result = await pick(await loadSandboxMedia())(...resolved);
      if (result instanceof Uint8Array) {
        const media = await loadSandboxMedia();
        const info = (await media.imageOps.info(result)) as {
          width?: number;
          height?: number;
          format?: string;
        };
        const meta: SandboxMediaMeta = {
          mimeType: info.format ? `image/${info.format}` : "image/png"
        };
        if (info.width !== undefined) meta.width = info.width;
        if (info.height !== undefined) meta.height = info.height;
        return mediaStore.put(result, meta);
      }
      return toGuestBytesDeep(result);
    };
  };

  const image = {
    /**
     * The one door from a handle back to real bytes, and deliberately the only
     * one. Every other op keeps the payload host-side, so a body that reaches
     * for this is saying it will read the bytes itself — the cost is explicit
     * at the call site instead of hidden in every hop. It needs no
     * ProcessingContext, so a Code node that really does parse an encoded image
     * works exactly as it did.
     */
    bytes: async (value: unknown): Promise<GuestBytes> => {
      const resolved = await resolveMediaArgs(
        "image.bytes",
        value,
        true,
        0,
        "image"
      );
      const media = await loadSandboxMedia();
      return toGuestBytes(media.asImageBytes(resolved, "image.bytes"));
    },
    /**
     * Handle → durable asset. Bytes stay on the host; the guest gets a ref.
     */
    toAsset: async (
      value: unknown,
      options?: Record<string, unknown>
    ): Promise<unknown> => {
      const sourceMime = mediaMimeForValue(value, "image");
      const resolved = await resolveMediaArgs(
        "image.toAsset",
        value,
        true,
        0,
        "image"
      );
      const media = await loadSandboxMedia();
      const bytes = media.asImageBytes(resolved, "image.toAsset");
      const mimeType = sniffMediaMime("image", bytes, sourceMime);
      const assetOptions = { mimeType, ...options };
      if (promoteMedia) {
        return promoteMedia("image", bytes, assetOptions);
      }
      if (context) {
        return mediaRefBridge.toImage(bytes, assetOptions);
      }
      throw new Error(
        "image.toAsset: cannot save an asset in this run. Use " +
          "nodetool.media.toImage from a chat action, or media.toImage " +
          "from a Code node."
      );
    },
    info: imageMember("info", (m) => m.imageOps.info),
    decode: imageMember("decode", (m) => m.imageOps.decode),
    stats: imageMember("stats", (m) => m.imageOps.stats),
    blank: imageMember("blank", (m) => m.imageOps.blank),
    pad: imageMember("pad", (m) => m.imageOps.pad),
    grid: imageMember("grid", (m) => m.imageOps.grid),
    resize: imageMember("resize", (m) => m.imageOps.resize),
    crop: imageMember("crop", (m) => m.imageOps.crop),
    rotate: imageMember("rotate", (m) => m.imageOps.rotate),
    flip: imageMember("flip", (m) => m.imageOps.flip),
    adjust: imageMember("adjust", (m) => m.imageOps.adjust),
    composite: imageMember("composite", (m) => m.imageOps.composite),
    convert: imageMember("convert", (m) => m.imageOps.convert)
  };

  const requireMediaBytes = (where: string, value: unknown): Uint8Array => {
    if (value instanceof Uint8Array) return value;
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    throw new Error(
      `${where}: expected media bytes, a media handle, or a media ref`
    );
  };

  const avMember = <A extends unknown[]>(
    namespace: "audio" | "video",
    name: string,
    inputTypes: readonly (SandboxMediaType | undefined)[],
    outputType: SandboxMediaType | undefined,
    pick: (
      media: Pick<SandboxAvMediaModule, "audioOps" | "videoOps">
    ) => (...args: A) => Promise<unknown>
  ): ((...args: A) => Promise<unknown>) => {
    const where = `${namespace}.${name}`;
    return async (...args: A) => {
      const budget = { used: 0 };
      const resolved: unknown[] = [];
      for (let index = 0; index < args.length; index += 1) {
        resolved.push(
          await resolveMediaArgs(
            where,
            args[index],
            true,
            0,
            inputTypes[index],
            budget
          )
        );
      }
      const result = await pick(await loadRunAvMedia())(...(resolved as A));
      if (outputType && result instanceof Uint8Array) {
        const sourceType = inputTypes[0] ?? outputType;
        const sourceMime = mediaMimeForValue(args[0], sourceType);
        return mediaStore.put(result, {
          type: outputType,
          mimeType: sniffMediaMime(
            outputType,
            result,
            outputType === sourceType
              ? sourceMime
              : defaultMediaMime(outputType)
          )
        });
      }
      return toGuestBytesDeep(result);
    };
  };

  const avBytes =
    (namespace: "audio" | "video") =>
    async (value: unknown): Promise<GuestBytes> => {
      const where = `${namespace}.bytes`;
      const resolved = await resolveMediaArgs(where, value, true, 0, namespace);
      return toGuestBytes(requireMediaBytes(where, resolved));
    };

  const avToAsset =
    (type: "audio" | "video") =>
    async (
      value: unknown,
      options?: Record<string, unknown>
    ): Promise<unknown> => {
      const where = `${type}.toAsset`;
      const sourceMime = mediaMimeForValue(value, type);
      const resolved = await resolveMediaArgs(where, value, true, 0, type);
      const bytes = requireMediaBytes(where, resolved);
      const mimeType = sniffMediaMime(type, bytes, sourceMime);
      const assetOptions = { mimeType, ...options };
      if (promoteMedia) {
        return promoteMedia(type, bytes, assetOptions);
      }
      if (context) {
        return type === "audio"
          ? mediaRefBridge.toAudio(bytes, assetOptions)
          : mediaRefBridge.toVideo(bytes, assetOptions);
      }
      throw new Error(
        `${where}: cannot save an asset in this run. Use media.to${
          type === "audio" ? "Audio" : "Video"
        } from a Code node.`
      );
    };

  const audio = {
    bytes: avBytes("audio"),
    toAsset: avToAsset("audio"),
    info: avMember(
      "audio",
      "info",
      ["audio"],
      undefined,
      (m) => m.audioOps.info
    ),
    normalize: avMember(
      "audio",
      "normalize",
      ["audio"],
      "audio",
      (m) => m.audioOps.normalize
    ),
    trim: avMember("audio", "trim", ["audio"], "audio", (m) => m.audioOps.trim),
    concat: avMember(
      "audio",
      "concat",
      ["audio"],
      "audio",
      (m) => m.audioOps.concat
    ),
    mix: avMember("audio", "mix", ["audio"], "audio", (m) => m.audioOps.mix),
    reverse: avMember(
      "audio",
      "reverse",
      ["audio"],
      "audio",
      (m) => m.audioOps.reverse
    ),
    fadeIn: avMember(
      "audio",
      "fadeIn",
      ["audio"],
      "audio",
      (m) => m.audioOps.fadeIn
    ),
    fadeOut: avMember(
      "audio",
      "fadeOut",
      ["audio"],
      "audio",
      (m) => m.audioOps.fadeOut
    ),
    repeat: avMember(
      "audio",
      "repeat",
      ["audio"],
      "audio",
      (m) => m.audioOps.repeat
    )
  };

  const video = {
    bytes: avBytes("video"),
    toAsset: avToAsset("video"),
    info: avMember(
      "video",
      "info",
      ["video"],
      undefined,
      (m) => m.videoOps.info
    ),
    trim: avMember("video", "trim", ["video"], "video", (m) => m.videoOps.trim),
    resize: avMember(
      "video",
      "resize",
      ["video"],
      "video",
      (m) => m.videoOps.resize
    ),
    rotate: avMember(
      "video",
      "rotate",
      ["video"],
      "video",
      (m) => m.videoOps.rotate
    ),
    addAudio: avMember(
      "video",
      "addAudio",
      ["video", "audio"],
      "video",
      (m) => m.videoOps.addAudio
    ),
    extractAudio: avMember(
      "video",
      "extractAudio",
      ["video"],
      "audio",
      (m) => m.videoOps.extractAudio
    ),
    extractFrame: avMember(
      "video",
      "extractFrame",
      ["video"],
      "image",
      (m) => m.videoOps.extractFrame
    )
  };

  const canvas = {
    render: imageMember("render", (m) => m.renderCanvas),
    measureText: mediaMember((m) => m.measureCanvasText)
  };

  // Media refs in and out. Unlike the transform namespaces, this one needs a
  // ProcessingContext — it resolves `asset://`, storage keys and package assets
  // through the host's own resolver — so without one every member throws.
  // `media.*` reads files, so it resolves paths through the same
  // `resolveGuestPath` `workspace.*` uses — one containment rule, one
  // `filesystemAccess` scope, no second scheme to keep in step.
  const mediaRefBridge = createMediaRefBridge(
    context,
    context
      ? {
          resolvePath: (path: string) => resolveGuestPath(context, path, false)
        }
      : {}
  );

  /** Each `media.*` member after handle resolution — one shared signature. */
  type MediaMemberMap = Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;

  // A media handle is accepted wherever `media.*` takes a ref or bytes. The
  // last step of a chain promotes the result with the matching `media.to*`
  // call. Only this promotion writes to storage; intermediates never do. The
  // wrapped members share one signature, so they are held under that type and
  // only the assembled `media` object claims the bridge's shape.
  const mediaMembers: MediaMemberMap = Object.fromEntries(
    Object.entries(mediaRefBridge).map(([name, fn]) => [
      name,
      async (...args: unknown[]) =>
        (fn as (...a: unknown[]) => Promise<unknown>)(
          ...((await resolveMediaArgs(
            `media.${name}`,
            args,
            false
          )) as unknown[])
        )
    ])
  );
  const promoteTypedHandle =
    (
      name: "toImage" | "toAudio" | "toVideo",
      promote: (
        value: unknown,
        options?: Record<string, unknown>
      ) => Promise<unknown>
    ) =>
    async (
      value: unknown,
      options?: Record<string, unknown>
    ): Promise<unknown> => {
      if (isSandboxMediaHandle(value)) {
        return promote(value, options);
      }
      return mediaMembers[name](value, options);
    };
  const media = {
    ...mediaMembers,
    toImage: promoteTypedHandle("toImage", image.toAsset),
    toAudio: promoteTypedHandle("toAudio", audio.toAsset),
    toVideo: promoteTypedHandle("toVideo", video.toAsset)
  } as typeof mediaRefBridge;

  const sandbox = {
    // Core JS globals are native in QuickJS; we still reflect them in the
    // descriptor so callers that inspect `sandbox.JSON` / `sandbox.Math`
    // (tests, debug tooling) see the expected references.
    console,
    JSON,
    Math,
    Date,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Promise,
    Error,
    TypeError,
    RangeError,
    URIError,
    SyntaxError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    structuredClone: globalThis.structuredClone,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    // Timer globals blocked — use sleep() for delays and Promise.all /
    // parallelMap for concurrency. The engine re-installs host-backed timers
    // on every evaluation, so the real deletion happens in wrapCode; these
    // entries keep the manifest's blocked list truthful.
    setTimeout: undefined,
    clearTimeout: undefined,
    setInterval: undefined,
    clearInterval: undefined,
    setImmediate: undefined,
    clearImmediate: undefined,
    // Bridge functions — the only non-native surface the sandbox exposes.
    fetch: sandboxedFetch,
    crypto: sandboxCrypto,
    sleep,
    getSecret,
    workspace,
    assetToSandbox,
    sandboxToAsset,
    progress,
    emit,
    output,
    // Behind the `stream` global the prelude builds; never reachable by name,
    // which is why they are not in EXPOSED_BRIDGE_NAMES.
    [SANDBOX_INPUT_TAKE_BINDING]: takeInput,
    [SANDBOX_STREAM_OPEN_BINDING]: streamOpen,
    format,
    image,
    audio,
    video,
    canvas,
    media,
    __maxIter: MAX_LOOP_ITERATIONS,
    // The run's declared secret scope, so `nodetool.secrets.list()` can answer
    // without a host call. Reading it is not the check — `getSecret` is.
    __secretScope: secretScope === null ? null : [...secretScope]
  } satisfies Record<string, unknown>;

  return {
    sandbox,
    getLogs: () => logs,
    getOutputs: () =>
      outputs.size > 0 ? Object.fromEntries(outputs) : undefined,
    getEmitted: () => (emitted.length > 0 ? [...emitted] : undefined)
  };
}

// ---------------------------------------------------------------------------
// Code execution
// ---------------------------------------------------------------------------

/**
 * User-code wrapping and the guest module loader live with the interpreter:
 * the worker path evaluates the same entry module and resolves through the
 * same loader, and a second copy of either would be a second security policy.
 */
export {
  BLOCKED_TIMER_GLOBALS,
  buildEntryModule,
  createGuestModuleHost,
  DELETED_GUEST_GLOBALS,
  EXPOSED_BRIDGE_NAMES,
  SANDBOX_CAPABILITY_BRIDGE_BINDING,
  SANDBOX_HOST_BRIDGE_BINDING,
  SANDBOX_INPUT_TAKE_BINDING,
  SANDBOX_STREAM_OPEN_BINDING,
  SANDBOX_WASM_BRIDGE_BINDING,
  wrapCode,
  type ExposedBridgeName,
  type GuestModuleHost
} from "./js-sandbox-worker/interpreter.js";

/**
 * The platform modules one run mounts: guest specifier → generated facade
 * source, plus the dispatcher every facade call lands on.
 *
 * Structural on purpose — `runInSandbox` knows how to mount a facade and
 * nothing about capabilities; the mount is built where a `CapabilityRun`
 * exists (`codeact/capability-modules.ts`).
 */
export interface SandboxCapabilityMount {
  readonly facades: ReadonlyMap<string, string>;
  call(
    moduleKey: unknown,
    exportName: unknown,
    args: unknown
  ): Promise<unknown>;
}

/**
 * A run's wall clock, which the host can stop while the guest waits on
 * something outside its own control — above all a permission prompt, which is
 * bounded only by how long a person takes to answer it.
 *
 * The timeout exists to bound *guest execution*: a runaway loop, a program that
 * never returns. Time a program spends parked on a host round-trip it cannot
 * hurry is not that, and charging it to the same budget kills the program
 * mid-wait — the answer then resolves nothing, because the sandbox that asked
 * is already gone.
 *
 * `suspend()` returns the matching resume; calls nest, and the clock restarts
 * only when the last one resumes.
 */
export interface SandboxClock {
  /** Stop the guest's budget until the returned function is called. */
  suspend(): () => void;
  /** Milliseconds suspended so far, including a suspension still open. */
  suspendedMs(): number;
}

export function createSandboxClock(): SandboxClock {
  let depth = 0;
  let openedAt = 0;
  let accumulated = 0;
  return {
    suspend() {
      if (depth === 0) openedAt = Date.now();
      depth++;
      let resumed = false;
      return () => {
        if (resumed) return;
        resumed = true;
        depth--;
        if (depth === 0) accumulated += Date.now() - openedAt;
      };
    },
    suspendedMs() {
      return depth > 0 ? accumulated + (Date.now() - openedAt) : accumulated;
    }
  };
}

export interface RunSandboxOptions {
  /** The JavaScript code to execute. */
  code: string;
  /** Optional ProcessingContext for workspace/secret APIs. */
  context?: ProcessingContext;
  /** Timeout in milliseconds (default 30s). */
  timeoutMs?: number;
  /** Extra variables to inject into the sandbox (e.g. dynamic inputs). */
  globals?: Record<string, unknown>;
  /**
   * External cancellation. On abort, in-flight host operations are aborted,
   * `sleep` returns immediately, and every subsequent bridge call fails fast so
   * the guest unwinds — a program that awaits anything stops within a bridge
   * call, and `runInSandbox` returns the cancelled result at once.
   *
   * A purely CPU-bound guest is the exception, and only on the in-process path.
   * The interrupt handler QuickJS polls reads the abort flag, but on this
   * thread only the event loop the spinning guest is blocking can set it — so
   * the guest runs to its deadline and `runInSandbox` returns ahead of it,
   * leaving an orphaned run to wind down on its own. Running the interpreter
   * off-thread is what makes that case abort promptly too.
   */
  signal?: AbortSignal;
  /**
   * Per-invocation limit overrides (fetch calls, response body, output size,
   * guest heap, stack, fetch timeout). Each is clamped to a hard ceiling, so a
   * caller can tune a limit but not disable a protection.
   */
  limits?: SandboxLimits;
  /**
   * Sink for guest `progress(percent, message?)` calls. Values are clamped to
   * 0–100, messages truncated, and reports rate-limited to one per
   * {@link PROGRESS_MIN_INTERVAL_MS} (at most {@link MAX_PROGRESS_CALLS} per
   * run). Without a callback the guest function is a no-op.
   */
  onProgress?: SandboxProgressCallback;
  /**
   * Sink for guest `emit(name, value)` calls. Every value reaches it, in call
   * order, and the guest's `emit` promise resolves only after it does — so an
   * `await emit(...)` blocks a producer the consumer cannot keep up with. A
   * sink that throws surfaces in the guest as a thrown error. Without a sink
   * the values are collected into {@link RunSandboxResult.emitted} instead.
   */
  onEmit?: SandboxEmitCallback;
  /**
   * Source behind the guest `stream` global: the host answers one take at a
   * time, with `null` meaning "any handle, arrival order" (`stream.any()`).
   * Without it the guest still has `stream`, and every call throws
   * {@link NO_INPUT_STREAM_MESSAGE} — a body that streams must be run by a host
   * that can feed it.
   *
   * A run with this set is metered differently: time parked on a take is
   * clock-suspended, so the timeout bounds guest execution only, and the
   * engine's own wall-clock backstop is widened to
   * {@link INPUT_STREAM_SUSPEND_ALLOWANCE_MS} unless the caller names an
   * allowance. A streaming body legitimately lives as long as its upstream;
   * cancelling the run is what ends it.
   */
  onTakeInput?: SandboxTakeInputCallback;
  /**
   * Answer to `stream.open(name)`. Read synchronously, so the guest sees a
   * boolean. Without it — even with {@link onTakeInput} set — every handle
   * reads closed.
   */
  onStreamOpen?: SandboxStreamOpenCallback;
  /**
   * Wall clock the host can stop while the guest waits on a round-trip it
   * cannot hurry (a permission prompt). Time suspended is added back to
   * {@link timeoutMs}, so the guest keeps its full execution budget across the
   * wait. Without a clock the timeout is plain wall-clock, as before.
   */
  clock?: SandboxClock;
  /**
   * Total suspension a run may accumulate before the engine aborts it anyway.
   * Only consulted when {@link clock} is set. Defaults to
   * {@link DEFAULT_SUSPEND_ALLOWANCE_MS}.
   */
  suspendAllowanceMs?: number;
  /**
   * Sandbox modules this run may import, already resolved by the catalog.
   * Without it the guest has no module loader at all, exactly as before: an
   * `import` resolves nothing. With it, these modules and their intra-pack
   * siblings are the only importable ones — see {@link createGuestModuleHost}.
   */
  modules?: SandboxModuleResolution;
  /**
   * NodeTool's own modules — `@nodetool-ai/sandbox-nodetool/<namespace>` — and
   * the dispatcher behind them. Host-declared: they never pass through the
   * consent allowlist {@link modules} is resolved against, because consent
   * gates third-party code and these are the platform's own surface, mounted
   * only for a session whose host built a capability run.
   */
  capabilities?: SandboxCapabilityMount;
  /**
   * Worker pool for host WASM calls. Defaults to the process-wide pool of
   * four, which is what production wants; a test passes its own to observe
   * the pool without sharing it with every other test in the file.
   */
  wasmPool?: WasmWorkerPool;
  /**
   * Load a media ref when this run has no ProcessingContext. Chat uses this so
   * media transforms can resolve generated results host-side and the guest
   * only sees handles.
   */
  resolveMediaRef?: (where: string, ref: unknown) => Promise<Uint8Array>;
  /**
   * Save host-side media bytes as an asset. Backs each transform namespace's
   * `toAsset` and `nodetool.media.toImage/toAudio/toVideo` in chat.
   */
  promoteMedia?: (
    type: "image" | "audio" | "video",
    bytes: Uint8Array,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
}

export interface RunSandboxResult {
  success: boolean;
  result?: unknown;
  error?: string;
  stack?: string;
  logs?: string[];
  /**
   * Final values the guest recorded with `output(name, value)`, marshaled the
   * way `result` is. Absent when the guest called `output` never, and dropped
   * on a failed run — a run that died has no answer to post.
   */
  outputs?: Record<string, unknown>;
  /**
   * Values the guest passed to `emit(name, value)`, in call order. Present only
   * when the caller passed no {@link RunSandboxOptions.onEmit} sink — with one,
   * the values went there instead.
   */
  emitted?: SandboxEmittedValue[];
}

const IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/** Overwrite the contents of `target` with the contents of `source` in place. */
function replaceInPlace(target: unknown, source: unknown): void {
  if (Array.isArray(target)) {
    target.length = 0;
    if (Array.isArray(source)) {
      for (let i = 0; i < source.length; i++) target[i] = source[i];
    }
    return;
  }
  if (isObjectLike(target)) {
    const t = target;
    for (const key of Object.keys(t)) delete t[key];
    if (isRecord(source)) {
      const s = source;
      for (const [k, v] of Object.entries(s)) t[k] = v;
    }
  }
}

/**
 * Globals the guest prelude defines rather than the host marshals. All but
 * `stream` are pure — no host call behind them; `stream` is built here because
 * an async iterable cannot cross the bridge, so the prelude wraps the two
 * private input bindings into one.
 */
export const GUEST_HELPER_NAMES = [
  "toBase64",
  "fromBase64",
  "toHex",
  "fromHex",
  "parallelMap",
  "createCanvas",
  "stream"
] as const;

export type GuestHelperName = (typeof GUEST_HELPER_NAMES)[number];

/**
 * A dispatcher's entry point as a bare function, or nothing when the run
 * declared no such modules — which is what decides whether the guest gets the
 * binding at all.
 */
function dispatchCallOf(
  dispatcher:
    | {
        call(
          moduleKey: unknown,
          exportName: unknown,
          args: unknown
        ): Promise<unknown>;
      }
    | undefined
): SandboxDispatchCall | undefined {
  if (dispatcher === undefined) return undefined;
  return async (moduleKey, exportName, args) =>
    dispatcher.call(moduleKey, exportName, args);
}

/** Names that should never be reassigned via `globals` — core sandbox APIs. */
export const RESERVED_SANDBOX_NAMES: ReadonlySet<string> = new Set<string>([
  ...EXPOSED_BRIDGE_NAMES,
  ...GUEST_HELPER_NAMES,
  SANDBOX_WASM_BRIDGE_BINDING,
  SANDBOX_WASM_DISPATCH_GLOBAL,
  SANDBOX_CAPABILITY_BRIDGE_BINDING,
  SANDBOX_CAPABILITY_DISPATCH_GLOBAL,
  SANDBOX_INPUT_TAKE_BINDING,
  SANDBOX_STREAM_OPEN_BINDING
]);

/**
 * Combine a guest error's name and message the way the report reads best:
 * include the name when it carries signal (`ExecutionTimeout`), drop it when
 * it is `Error` or already inside the message.
 */
function combineGuestError(name: string, message: string): string {
  return name &&
    name !== "Error" &&
    !message.toLowerCase().includes(name.toLowerCase())
    ? `${name}: ${message}`
    : message || name;
}

/** Warn once per process when the worker path silently falls back in-process. */
let warnedWorkerFallback = false;

function noteWorkerFallback(reason: string): void {
  if (warnedWorkerFallback) return;
  warnedWorkerFallback = true;
  console.warn(
    `sandbox: running in-process (${reason}); a CPU-bound guest will block ` +
      "this thread until its timeout"
  );
}

/**
 * Execute JavaScript code inside a QuickJS WebAssembly sandbox.
 *
 * The runtime enforces hard memory and CPU limits via QuickJS's own interrupt
 * handler / memory limiter, so runaway user code can't exhaust host resources.
 */
export async function runInSandbox(
  options: RunSandboxOptions
): Promise<RunSandboxResult> {
  const {
    code,
    context,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    globals,
    signal,
    limits,
    onProgress,
    onEmit,
    onTakeInput,
    onStreamOpen,
    clock,
    modules,
    capabilities,
    wasmPool,
    resolveMediaRef,
    promoteMedia
  } = options;
  const resolvedLimits = resolveSandboxLimits(limits);
  // A streaming run needs a clock whether or not the caller brought one: the
  // time it spends parked on upstream is not its own execution.
  const activeClock = clock ?? (onTakeInput ? createSandboxClock() : undefined);
  const suspendAllowanceMs =
    options.suspendAllowanceMs ??
    (onTakeInput
      ? INPUT_STREAM_SUSPEND_ALLOWANCE_MS
      : DEFAULT_SUSPEND_ALLOWANCE_MS);

  if (!code.trim()) {
    return { success: false, error: "No code provided", logs: [] };
  }

  // The dispatcher is built first: it reads every declared WASM binary, so a
  // module the catalog could not honour is reported here rather than as a
  // broken facade the guest imports.
  let wasm: SandboxWasmDispatcher | undefined;
  let hostModules: SandboxHostDispatcher | undefined;
  const wasmOptions: Parameters<typeof createSandboxWasmDispatcher>[1] = {};
  if (wasmPool !== undefined) wasmOptions.pool = wasmPool;
  if (signal !== undefined) wasmOptions.signal = signal;
  const hostOptions: Parameters<typeof createSandboxHostDispatcher>[1] = {};
  if (signal !== undefined) hostOptions.signal = signal;
  try {
    wasm = modules
      ? createSandboxWasmDispatcher(modules.modules, wasmOptions)
      : undefined;
    hostModules = modules
      ? createSandboxHostDispatcher(modules.modules, hostOptions)
      : undefined;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      logs: []
    };
  }

  if (signal?.aborted) {
    return { success: false, error: "Execution cancelled", logs: [] };
  }

  const streams: SandboxInputStreams = {};
  if (onTakeInput !== undefined) streams.onTakeInput = onTakeInput;
  if (onStreamOpen !== undefined) streams.onStreamOpen = onStreamOpen;
  if (activeClock !== undefined) streams.clock = activeClock;

  const { sandbox, getLogs, getOutputs, getEmitted } = buildSandbox(
    context,
    signal,
    resolvedLimits,
    onProgress,
    onEmit,
    streams,
    resolveMediaRef,
    promoteMedia
  );

  // User-supplied globals (dynamic inputs from CodeNode etc.) layer on top of
  // the core surface, but must not clobber the bridge functions themselves.
  const userGlobals: Record<string, unknown> = {};
  if (globals) {
    for (const [key, value] of Object.entries(globals)) {
      if (RESERVED_SANDBOX_NAMES.has(key)) continue;
      if (!IDENTIFIER_RE.test(key)) continue;
      userGlobals[key] = value;
    }
  }
  // Identify object-typed globals whose contents should be synced back to the
  // host after the guest runs. Primitives are passed by value and need no sync.
  const syncTargetNames = Object.entries(userGlobals)
    .filter(([, v]) => isObjectLike(v))
    .map(([k]) => k);

  // Write the extracted object-global snapshots back into the caller's own
  // objects. Both paths end here: node:vm shared the host heap, QuickJS does
  // not, and a worker makes the separation literal. CodeNode relies on this to
  // make its `state` object persist across invocations.
  const writeBackGlobals = (
    extracted: Record<string, unknown> | undefined
  ): void => {
    if (!extracted) return;
    for (const name of syncTargetNames) {
      const hostValue = userGlobals[name] as unknown;
      const guestValue = extracted[name];
      if (isObjectLike(hostValue) && isObjectLike(guestValue)) {
        replaceInPlace(hostValue, guestValue);
      }
    }
  };

  // Off the main thread whenever possible. A CPU-bound guest blocks whichever
  // thread runs it; on the server's main thread that freeze takes the whole
  // event loop — including the websocket `stop` frame that would have
  // cancelled the run — down with it. On a worker, abort is `terminate()`,
  // immediate for spinning and parked guests alike; the logs and emitted
  // values survive because they accumulate on this side of the port.
  //
  // Streaming runs stay in-process: the synchronous `stream.open` probe is
  // served from a worker-local mirror that must be seeded with the handle
  // names, which this signature does not carry. Those runs park on takes and
  // yield the thread constantly, so the freeze this path exists for cannot
  // build up there.
  const env =
    typeof globalThis.process?.env === "object"
      ? globalThis.process.env
      : undefined;
  const workerRequired = env?.NODETOOL_SANDBOX_WORKER === "require";
  let workerUnavailable: string | null = null;
  // A chosen or designed fallback is quiet; an environmental one warns once.
  let fallbackByDesign = false;
  if (env?.NODETOOL_SANDBOX_INPROC === "1") {
    workerUnavailable = "NODETOOL_SANDBOX_INPROC=1";
    fallbackByDesign = true;
  } else if (onTakeInput !== undefined || onStreamOpen !== undefined) {
    workerUnavailable = "the run streams inputs";
    fallbackByDesign = true;
  } else {
    const safety = precheckCloneSafety(userGlobals);
    if (!safety.ok) {
      workerUnavailable = safety.reason;
    }
  }
  if (workerUnavailable === null) {
    const dispatcherKinds: SandboxDispatcherKind[] = [];
    const dispatch: Record<string, unknown> = { ...sandbox };
    const bindDispatcher = (
      kind: SandboxDispatcherKind,
      call: SandboxDispatchCall | undefined
    ): void => {
      if (call === undefined) return;
      dispatch[SANDBOX_DISPATCHER_BINDINGS[kind]] = call;
      dispatcherKinds.push(kind);
    };
    bindDispatcher("wasm", dispatchCallOf(wasm));
    bindDispatcher("host", dispatchCallOf(hostModules));
    bindDispatcher("capability", dispatchCallOf(capabilities));
    for (const [name, value] of Object.entries(userGlobals)) {
      if (isFunction(value)) dispatch[name] = value;
    }

    const workerRun: WritableRun = {
      runId: globalThis.crypto.randomUUID(),
      code,
      timeoutMs,
      limits: resolvedLimits,
      suspendAllowanceMs,
      hasClock: activeClock !== undefined,
      engineTimeoutMs:
        activeClock !== undefined
          ? Math.min(timeoutMs + suspendAllowanceMs, MAX_ENGINE_TIMEOUT_MS)
          : timeoutMs,
      streamOpenSeed: null,
      bridgeShape: deriveBridgeShape({
        bridges: sandbox,
        dispatchers: dispatcherKinds,
        globals: userGlobals
      })
    };
    if (modules !== undefined) workerRun.modules = modules;
    if (capabilities?.facades !== undefined) {
      workerRun.capabilityFacades = capabilities.facades;
    }
    const workerOptions: WritableRunInWorkerOptions = {
      run: workerRun,
      dispatch,
      // Console and progress already reach their accumulators through the
      // RPC'd bridges; the push channel exists for a worker that has nothing
      // else to say, which this integration does not use.
      onLog: () => {},
      onProgress: () => {}
    };
    if (signal !== undefined) workerOptions.signal = signal;
    if (activeClock !== undefined) {
      workerOptions.suspendedMs = () => activeClock.suspendedMs();
    }
    const message: SandboxWorkerResult | null =
      await runInWorker(workerOptions);
    if (message === null) {
      workerUnavailable = "no sandbox worker could be started here";
    } else {
      writeBackGlobals(message.syncedGlobals);
      const logs = getLogs();
      // Cancellation wins over whatever the guest was doing when the interrupt
      // handler cut it — the in-process race has the same rule. The interrupted
      // guest's own error (`InternalError: interrupted`) is an implementation
      // detail, not a result.
      if (signal?.aborted === true) {
        return {
          success: false,
          error: "Execution cancelled",
          logs,
          emitted: getEmitted()
        };
      }
      if (message.failure === "cancelled") {
        return {
          success: false,
          error: "Execution cancelled",
          logs,
          emitted: getEmitted()
        };
      }
      if (message.failure === "worker") {
        return {
          success: false,
          error: describeEngineFailure(
            new Error(message.errorMessage ?? "the sandbox worker failed")
          ),
          logs: logs.length > 0 ? logs : undefined,
          emitted: getEmitted()
        };
      }
      if (!message.evalOk) {
        return {
          success: false,
          error: combineGuestError(
            message.errorName ?? "",
            message.errorMessage ?? ""
          ),
          stack: message.errorStack
            ? cleanStack(message.errorStack)
            : undefined,
          logs: logs.length > 0 ? logs : undefined,
          emitted: getEmitted()
        };
      }
      return {
        success: true,
        result: serializeResult(message.data, resolvedLimits.maxOutputSize),
        logs: logs.length > 0 ? logs : undefined,
        outputs: getOutputs(),
        emitted: getEmitted()
      };
    }
  }
  if (workerRequired) {
    return {
      success: false,
      error: `the sandbox worker path is required (NODETOOL_SANDBOX_WORKER=require) but unavailable: ${workerUnavailable}`,
      logs: []
    };
  }
  if (!fallbackByDesign) {
    noteWorkerFallback(workerUnavailable);
  }

  try {
    const { runSandboxed } = await getEngine();

    // The dispatchers stay on this side of the boundary — the interpreter only
    // ever sees a call function, which is as true of a worker's RPC proxy as it
    // is of the real dispatcher here.
    const interpreterParams: InterpreterParams = {
      runSandboxed,
      code,
      sandbox,
      globals: userGlobals,
      syncTargetNames,
      timeoutMs,
      limits: resolvedLimits,
      suspendAllowanceMs,
      hasClock: activeClock !== undefined,
      wasmCall: dispatchCallOf(wasm),
      hostCall: dispatchCallOf(hostModules),
      capabilityCall: dispatchCallOf(capabilities),
      modules,
      capabilityFacades: capabilities?.facades
    };
    // The interpreter cannot hold either host object: neither an AbortSignal
    // nor a clock survives a thread boundary, so both arrive as a probe.
    if (signal !== undefined) {
      interpreterParams.isAborted = () => signal.aborted;
    }
    if (activeClock !== undefined) {
      interpreterParams.suspendedMs = () => activeClock.suspendedMs();
    }
    const sandboxRun = runInterpreter(interpreterParams).then(
      (outcome: InterpreterOutcome) => {
        // The write-back runs as soon as the guest is done, even when
        // cancellation already won the race below — an orphaned run still owns
        // the answer it computed.
        writeBackGlobals(outcome.syncedGlobals);
        return outcome;
      }
    );

    // Return as soon as cancellation lands. The bridges above make a guest that
    // awaits anything unwind almost immediately; this race additionally covers
    // a CPU-bound guest, which QuickJS gives us no way to interrupt early — the
    // orphaned run still winds down on its own execution timeout.
    const cancellation = new Promise<null>((resolve) => {
      if (!signal) return;
      signal.addEventListener("abort", () => resolve(null), { once: true });
    });
    const raced = await guardHostProcess(
      Promise.race([sandboxRun, cancellation])
    );
    if (raced === null) {
      return {
        success: false,
        error: "Execution cancelled",
        logs: getLogs(),
        emitted: getEmitted()
      };
    }
    const evalResponse = raced;

    const logs = getLogs();

    if (!evalResponse.ok) {
      const combined = combineGuestError(
        evalResponse.error.name,
        evalResponse.error.message
      );
      return {
        success: false,
        error: combined,
        stack: evalResponse.error.stack
          ? cleanStack(evalResponse.error.stack)
          : undefined,
        logs: logs.length > 0 ? logs : undefined,
        // Emitted values were delivered while the guest still ran, so they
        // stand. Recorded `output` finals do not: the run has no answer.
        emitted: getEmitted()
      };
    }

    return {
      success: true,
      result: serializeResult(evalResponse.data, resolvedLimits.maxOutputSize),
      logs: logs.length > 0 ? logs : undefined,
      outputs: getOutputs(),
      emitted: getEmitted()
    };
  } catch (e: unknown) {
    // Host-side failures (engine load error, marshaling bug, an aborted
    // runtime). Guest-side errors go through evalResponse.ok=false above.
    // An engine failure is reported in terms the caller can act on: the raw
    // Emscripten assertion text tells an agent nothing it can retry against.
    const logs = getLogs();
    const errorMessage = describeEngineFailure(e);
    const errorStack =
      e instanceof Error ? cleanStack(e.stack ?? "") : undefined;

    return {
      success: false,
      error: errorMessage,
      stack: errorStack,
      logs: logs.length > 0 ? logs : undefined,
      emitted: getEmitted()
    };
  }
}

// ---------------------------------------------------------------------------
// Guest preludes for tool-bridged hosts
// ---------------------------------------------------------------------------

/**
 * Re-exported here because `./js-sandbox` is the one browser-safe subpath
 * export of this package: `nodetool.code.Code` (packages/code-nodes) is
 * bundled for the in-browser runner and must reach these prelude strings
 * without importing the package index, which drags the whole toolbelt —
 * native canvas, IMAP, execution — into a web build. Both modules are pure
 * strings over leaf imports.
 */
export { TOOLS_PRELUDE } from "./codeact/tools-prelude.js";
export { NODETOOL_API_PRELUDE_FULL } from "./codeact/nodetool-api.js";
