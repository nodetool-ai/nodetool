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

import {
  addSerializer,
  expose,
  getModuleLoader as createDefaultModuleLoader,
  loadQuickJs,
  modulePathNormalizer as defaultModulePathNormalizer
} from "@sebastianwessel/quickjs";
import * as acorn from "acorn";
import {
  generateSandboxHostFacade,
  generateSandboxWasmFacade,
  sandboxHostModule,
  SANDBOX_CAPABILITY_BRIDGE_SOURCE,
  SANDBOX_CAPABILITY_BRIDGE_SPECIFIER,
  SANDBOX_CAPABILITY_DISPATCH_GLOBAL,
  SANDBOX_HOST_BRIDGE_SOURCE,
  SANDBOX_HOST_BRIDGE_SPECIFIER,
  SANDBOX_HOST_DISPATCH_GLOBAL,
  SANDBOX_WASM_BRIDGE_SOURCE,
  SANDBOX_WASM_BRIDGE_SPECIFIER,
  SANDBOX_WASM_DISPATCH_GLOBAL,
  type SandboxModuleResolution
} from "@nodetool-ai/protocol";

import {
  createSandboxHostDispatcher,
  type SandboxHostDispatcher
} from "./host-modules/dispatcher.js";
import {
  BASE64_ALPHABET,
  SANDBOX_BYTES_MARKER,
  toGuestBytes,
  toGuestBytesDeep
} from "./sandbox-bytes.js";
import {
  createMediaRefBridge,
  MEDIA_REF_MEMBERS
} from "./sandbox-media-ref.js";
import {
  createSandboxWasmDispatcher,
  type SandboxWasmDispatcher,
  type WasmWorkerPool
} from "./wasm-sandbox/host.js";
// The variant package uses a `default` export. With `esModuleInterop` this
// typechecks as a namespace, so reach through `.default` explicitly.
import * as quickJsVariantModule from "@jitl/quickjs-ng-wasmfile-release-sync";
const quickJsVariant = (
  quickJsVariantModule as unknown as {
    default: Parameters<typeof loadQuickJs>[0];
  }
).default;
import { Scope } from "quickjs-emscripten-core";
import { importNodeBuiltin } from "@nodetool-ai/config";
import {
  CANVAS_GRADIENT_FACTORIES,
  CANVAS_GRADIENT_MARKER,
  CANVAS_METHODS,
  CANVAS_PROPERTIES
} from "./sandbox-canvas-api.js";
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
 * The engine's wall-clock abort is a `setTimeout`, and Node fires a delay past
 * this immediately instead of never — so this is the practical "no backstop".
 */
const MAX_ENGINE_TIMEOUT_MS = 2_147_483_647;
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
 * paths say the same thing.
 */
export const NO_INPUT_STREAM_MESSAGE =
  "stream() requires streaming-input mode; this run has no input stream";

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
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
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
let serializersRegistered = false;

function registerTypedArraySerializers(): void {
  if (serializersRegistered) return;
  serializersRegistered = true;

  // Map every typed-array class to a native Uint8Array on the host side.
  // The guest returns `new Uint8Array([...])` (or friends); without this,
  // the library's generic object serializer produces a plain object with
  // numeric keys, which downstream code (CodeNode's normalizeOutput) would
  // miss when detecting binary values.
  const typedArrayNames = [
    "Uint8Array",
    "Int8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array"
  ];
  for (const name of typedArrayNames) {
    addSerializer(name, (ctx, handle) => {
      const bufferHandle = ctx.getProp(handle, "buffer");
      try {
        const ab = ctx.getArrayBuffer(bufferHandle);
        return Uint8Array.from(ab.value);
      } finally {
        bufferHandle.dispose();
      }
    });
  }
}

function getEngine(): ReturnType<typeof loadQuickJs> {
  registerTypedArraySerializers();
  if (!enginePromise) {
    enginePromise = loadQuickJs(quickJsVariant);
  }
  return enginePromise;
}

/**
 * Marker key placed on an object to signal a sandboxed error. A host async
 * function that would normally `throw` instead resolves with one of these
 * objects; a prelude inside the guest rewraps them as real guest-side errors.
 *
 * This indirection exists because the current `@sebastianwessel/quickjs`
 * runtime leaks handles whenever a host-backed guest Promise is *rejected*,
 * tripping an internal assertion (`list_empty(&rt->gc_obj_list)`) in
 * quickjs-ng when the runtime is freed. Routing failures through a resolved
 * tagged value sidesteps the leak while preserving the guest-visible
 * behaviour (the user still gets a thrown Error with name + message).
 */
const SANDBOX_ERROR_MARKER = "__nodetool_sandbox_error__";

function neverReject<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>
): (...args: Args) => Promise<R | Record<string, unknown>> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (e) {
      return {
        [SANDBOX_ERROR_MARKER]: true,
        name: e instanceof Error ? e.name : "Error",
        message: e instanceof Error ? e.message : String(e)
      };
    }
  };
}

/**
 * Compose with {@link neverReject}: once `signal` fires, every subsequent host
 * bridge call fails fast instead of doing work. The guest prelude rewraps the
 * marker into a real `throw`, so an awaiting script unwinds on its next bridge
 * call rather than running to completion after the user cancelled.
 */
function guardAbort<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R | Record<string, unknown>>,
  signal?: AbortSignal
): (...args: Args) => Promise<R | Record<string, unknown>> {
  if (!signal) return fn;
  return async (...args: Args) => {
    if (signal.aborted) {
      return {
        [SANDBOX_ERROR_MARKER]: true,
        name: "ExecutionCancelled",
        message: "Execution cancelled"
      };
    }
    return fn(...args);
  };
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

/**
 * The media engine behind the `image` and `canvas` bridges. Loaded on first
 * use like the host modules, and for the same reasons — the canvas backend
 * (Skia on Node) is heavy, and nothing that never draws should pay for it.
 * Unlike those, the import is intra-package, so every bundler resolves it.
 */
async function loadSandboxMedia(): Promise<SandboxMediaModule> {
  return import("./sandbox-media.js");
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
  const tail = parts.length === 2 ? (parts[1] ? parts[1].split(":") : []) : null;
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
  const octets = (): [number, number] => [(nums[6] >> 8) & 0xff, nums[6] & 0xff];
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
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

function isTypedArray(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
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
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (isTypedArray(value)) return toNativeUint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value.map(Number));
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { length?: unknown }).length === "number"
  ) {
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
  if (value === null || typeof value !== "object") return false;
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
  if (value === null || typeof value !== "object") return value;
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
): unknown {
  if (result === undefined) return null;
  if (result === null) return null;
  if (
    typeof result === "string" ||
    typeof result === "number" ||
    typeof result === "boolean"
  ) {
    if (typeof result === "string" && result.length > maxOutputSize) {
      return truncate(result, maxOutputSize);
    }
    return result;
  }
  if (isTypedArray(result)) {
    return toNativeUint8Array(result);
  }
  if (typeof result === "object") {
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
 */
export function buildSandbox(
  context?: ProcessingContext,
  signal?: AbortSignal,
  limits?: SandboxLimits,
  onProgress?: SandboxProgressCallback,
  onEmit?: SandboxEmitCallback,
  streams?: SandboxInputStreams
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
    if (typeof url !== "string" || !url) {
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
      if (options?.headers && typeof options.headers === "object") {
        Object.assign(requestHeaders, options.headers as Record<string, string>);
      }
      if (Object.keys(requestHeaders).length > 0) {
        fetchOptions.headers = requestHeaders;
      }
      if (options?.body !== undefined) {
        const body = options.body;
        if (typeof body === "string") {
          fetchOptions.body = body;
        } else if (isTypedArray(body)) {
          // Binary request body. A guest Uint8Array reaches the host as a
          // native one via the typed-array serializers, but normalize anyway
          // so a numeric-keyed object is sent as raw bytes, not as JSON.
          fetchOptions.body = toNativeUint8Array(body) as unknown as BodyInit;
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
      const onNode =
        typeof globalThis.process?.versions?.node === "string";
      let response: Response;
      if (!onNode) {
        response = await fetch(url, { ...fetchOptions, redirect: "follow" });
      } else {
        const dropContentHeaders = (
          h: Record<string, string>
        ): Record<string, string> => {
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
        ): Record<string, string> => {
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

      return {
        ok,
        status,
        statusText,
        headers,
        body: getText(),
        json: parsedJson,
        text: async () => getText(),
        // Both binary accessors return the bytes marker; the guest prelude's
        // fetch wrapper turns them back into a Uint8Array / ArrayBuffer.
        arrayBuffer: async () => toGuestBytes(rawBytes),
        bytes: async () => toGuestBytes(rawBytes)
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
    digest: async (
      algorithm: string,
      data: unknown
    ): Promise<Record<string, string>> => {
      const algo = normalizeDigestAlgorithm(algorithm);
      const bytes = coerceBytesInput(data, "data");
      const digest = await webCryptoSubtle().digest(algo, bytes);
      return toGuestBytes(new Uint8Array(digest));
    },
    hmac: async (
      algorithm: string,
      key: unknown,
      data: unknown
    ): Promise<Record<string, string>> => {
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
          throw new Error("workspace.remove is not available without a context");
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
    ? async (path: string): Promise<unknown> => {
        return context.sandboxToAsset(path);
      }
    : async (_path: string): Promise<unknown> => {
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
    if (typeof name !== "string") {
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
    if (name !== null && typeof name !== "string") {
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
    if (typeof name !== "string" || !streams.onStreamOpen) return false;
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
    withGuestBytes(async (...args: A) => pick(await loadSandboxMedia())(...args));

  const image = {
    info: mediaMember((m) => m.imageOps.info),
    decode: mediaMember((m) => m.imageOps.decode),
    encode: mediaMember((m) => m.imageOps.encode),
    resize: mediaMember((m) => m.imageOps.resize),
    crop: mediaMember((m) => m.imageOps.crop),
    rotate: mediaMember((m) => m.imageOps.rotate),
    flip: mediaMember((m) => m.imageOps.flip),
    adjust: mediaMember((m) => m.imageOps.adjust),
    composite: mediaMember((m) => m.imageOps.composite),
    convert: mediaMember((m) => m.imageOps.convert)
  };

  const canvas = {
    render: mediaMember((m) => m.renderCanvas),
    measureText: mediaMember((m) => m.measureCanvasText)
  };

  // Media refs in and out. Unlike `image`/`canvas` this one needs a
  // ProcessingContext — it resolves `asset://`, storage keys and package assets
  // through the host's own resolver — so without one every member throws.
  const media = createMediaRefBridge(context);

  const sandbox: Record<string, unknown> = {
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
    canvas,
    media,
    __maxIter: MAX_LOOP_ITERATIONS,
    // The run's declared secret scope, so `nodetool.secrets.list()` can answer
    // without a host call. Reading it is not the check — `getSecret` is.
    __secretScope: secretScope === null ? null : [...secretScope]
  };

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
 * Timer globals the guest must not see. The documented contract has always
 * been "`sleep` is the only timer", but `@sebastianwessel/quickjs` installs
 * host-backed `setTimeout`/`setInterval`/`setImmediate` into the context on
 * every `evalCode` call — *after* the init prelude runs — so a prelude-time
 * `delete` does not stick. {@link wrapCode} deletes them inside the user-code
 * module itself, which evaluates after the library's re-install. They are
 * blocked deliberately: their callbacks fire through `ctx.callFunction` with
 * errors silently discarded, outside the never-reject and abort-guard
 * conventions every bridge follows. Concurrency does not need them —
 * bridge calls run in parallel under `Promise.all`/`parallelMap`.
 */
export const BLOCKED_TIMER_GLOBALS = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate"
] as const;

/**
 * Wrap user code as the default export of an ES module with a top-level-awaited
 * async IIFE body, so `return <value>` inside the snippet becomes the module's
 * default export and `await` at the top level works. The module first drops
 * the timer globals the engine re-installs per evaluation (see
 * {@link BLOCKED_TIMER_GLOBALS}).
 */
export function wrapCode(code: string, prelude = ""): string {
  return `${dropTimersStatement()}${prelude}
export default await (async () => {
${code}
})();`;
}

function dropTimersStatement(): string {
  return BLOCKED_TIMER_GLOBALS.map((n) => `delete globalThis.${n};`).join(" ");
}

/**
 * Build the entry module for user code, hoisting static `import` declarations
 * out of the async IIFE {@link wrapCode} wraps the body in.
 *
 * An `import` is only legal at module top level, so the IIFE body cannot hold
 * one. The imports are spliced out by source range and re-emitted on a single
 * line above the wrapper; the ranges they vacate are blanked with spaces (never
 * with fewer newlines), so every remaining line of user code keeps its content
 * and its offset from the body's start. The whole body shifts down by exactly
 * one line relative to {@link wrapCode}'s output.
 *
 * Import-free code takes the {@link wrapCode} path unchanged, and so does code
 * acorn cannot parse — a syntax error must reach the guest exactly as the user
 * wrote it, not as this transform's complaint about it.
 *
 * Dynamic `import()` expressions are left where they are. The module loader
 * denies them at runtime (see {@link createGuestModuleHost}); rewriting them
 * here would only move a runtime denial into a confusing compile-time one.
 */
export function buildEntryModule(code: string, prelude = ""): string {
  let program: acorn.Program;
  try {
    program = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true
    });
  } catch {
    return wrapCode(code, prelude);
  }

  const imports = program.body.filter(
    (node): node is acorn.ImportDeclaration => node.type === "ImportDeclaration"
  );
  if (imports.length === 0) return wrapCode(code, prelude);

  const hoisted: string[] = [];
  let body = "";
  let cursor = 0;
  for (const declaration of imports) {
    const text = code.slice(declaration.start, declaration.end);
    hoisted.push(text.endsWith(";") ? text : `${text};`);
    body += code.slice(cursor, declaration.start);
    body += text.replace(/[^\n]/g, " ");
    cursor = declaration.end;
  }
  body += code.slice(cursor);

  return `${hoisted.join(" ")}
${dropTimersStatement()}${prelude}
export default await (async () => {
${body}
})();`;
}

// ---------------------------------------------------------------------------
// Guest module loading
// ---------------------------------------------------------------------------

/** Prefix of every module id this host resolves. Not a path — nothing mounts it. */
const GUEST_MODULE_PREFIX = "nodetool-sandbox:";

/**
 * The module id every denial normalizes to. QuickJS never caches a module whose
 * load failed, so one constant id serves every denial in a run: the normalizer
 * records the reason, the loader immediately turns it into a guest-side Error.
 */
const DENIED_MODULE_ID = `${GUEST_MODULE_PREFIX}denied`;

/** Separator between a pack name and a file id inside a module id. */
const GUEST_MODULE_SEPARATOR = "|";

/**
 * The private bridge module's guest id.
 *
 * Only a generated WASM facade may import it. The denial is decided by the
 * importing module, so neither user code nor a pack's authored JavaScript can
 * reach it by name — and a module that reaches the dispatcher some other way
 * gains nothing beyond the run's declared WASM surface, because the
 * dispatcher's own checks are the boundary.
 */
const WASM_BRIDGE_MODULE_ID = `${GUEST_MODULE_PREFIX}wasm-bridge`;

/** Name the host parks the raw (never-rejecting) dispatcher bridge on. */
export const SANDBOX_WASM_BRIDGE_BINDING = "__wasmCall";

/**
 * The private host-bridge module's guest id.
 *
 * Only a generated host facade may import it, decided by the importing module —
 * so neither user code nor a pack's authored JavaScript can reach it by name.
 * A module that reaches the dispatcher some other way gains nothing beyond the
 * run's declared host surface, because the dispatcher's checks are the boundary.
 */
const HOST_BRIDGE_MODULE_ID = `${GUEST_MODULE_PREFIX}host-bridge`;

/** Name the host parks the raw (never-rejecting) host dispatcher bridge on. */
export const SANDBOX_HOST_BRIDGE_BINDING = "__hostCall";

/**
 * The private capability-bridge module's guest id.
 *
 * Same rule as the host bridge: only a generated capability facade may import
 * it. What differs is who mounts a capability module — the host, per session,
 * never a pack's manifest and never the model's consent allowlist.
 */
const CAPABILITY_BRIDGE_MODULE_ID = `${GUEST_MODULE_PREFIX}capability-bridge`;

/** Name the host parks the raw (never-rejecting) capability dispatcher on. */
export const SANDBOX_CAPABILITY_BRIDGE_BINDING = "__capabilityCall";

/**
 * Names the host parks the input bridges on, which the prelude captures and
 * then deletes — the guest reaches them only through `stream`.
 */
export const SANDBOX_INPUT_TAKE_BINDING = "__takeInput";
export const SANDBOX_STREAM_OPEN_BINDING = "__streamOpen";

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
  call(moduleKey: unknown, exportName: unknown, args: unknown): Promise<unknown>;
}

function guestModuleId(packName: string, fileId: string): string {
  return `${GUEST_MODULE_PREFIX}${packName}${GUEST_MODULE_SEPARATOR}${fileId}`;
}

/** Resolve a `./`-relative specifier against a pack-relative file id. */
function resolveRelativeFileId(fromFileId: string, specifier: string): string {
  const parts = fromFileId.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

type SandboxRunOptions = NonNullable<
  Parameters<Awaited<ReturnType<typeof loadQuickJs>>["runSandboxed"]>[1]
>;

export interface GuestModuleHost {
  /** Loader and normalizer to hand `runSandboxed`. */
  readonly options: Pick<
    SandboxRunOptions,
    "getModuleLoader" | "modulePathNormalizer"
  >;
  /** Stop delegating to the wrapper's own Node-compat resolution. */
  enterGuestPhase(): void;
  /** After the entry's static graph is linked, every further resolve is dynamic. */
  lockStaticGraph(): void;
}

/**
 * Install the run's declared sandbox modules as the *only* importable modules.
 *
 * The enforcement point is the **normalizer**, not the loader: QuickJS resolves
 * an already-loaded module straight out of its cache without consulting the
 * loader, but it normalizes every specifier first. A denial decided in the
 * normalizer therefore also holds for `node:buffer` and friends, which the
 * wrapper imports into the cache during its own bootstrap
 * (`prepareNodeCompatibility`) before guest code exists.
 *
 * Three phases, in order:
 *
 * 1. **bootstrap** — the wrapper's `import 'node:buffer'` and the rest of its
 *    compat preamble run before our sandboxed function is called. They resolve
 *    through the library's own normalizer and loader, or the runtime never
 *    starts.
 * 2. **guest, linking** — only the run's declared specifiers and their
 *    intra-pack siblings resolve. Everything else — `node:*`, the compat
 *    modules the bootstrap warmed, absolute paths, `../` escapes, encoded
 *    traversals, another pack's internal files — is denied by name.
 * 3. **guest, locked** — the entry module's static graph is linked, so any
 *    further resolution is a dynamic `import()`, and every one of those is
 *    denied. A computed specifier is unknowable ahead of the call, and the
 *    declaration is the whole contract, so the stricter rule is the honest one.
 *
 * Loaded module sources are prefixed with the timer deletions
 * ({@link BLOCKED_TIMER_GLOBALS}) on the same line as their first statement:
 * dependencies evaluate *before* the entry body, so the entry's own deletions
 * come too late to harden them. `eval`/`Function` need no such treatment — the
 * init prelude deletes them for the whole context before any user `evalCode`.
 */
export function createGuestModuleHost(
  modules: SandboxModuleResolution | undefined,
  capabilityFacades?: ReadonlyMap<string, string>
): GuestModuleHost | undefined {
  const sources = new Map<string, string>();
  const specifiers = new Map<string, string>();
  const facades = new Set<string>();
  const hostFacades = new Set<string>();
  const platformFacades = new Set<string>();
  for (const [specifier, source] of capabilityFacades ?? []) {
    // A platform module has no pack behind it, so its guest id is derived from
    // the specifier rather than from a pack/file pair.
    const entryId = `${GUEST_MODULE_PREFIX}capability${GUEST_MODULE_SEPARATOR}${specifier}`;
    specifiers.set(specifier, entryId);
    sources.set(entryId, source);
    platformFacades.add(entryId);
  }
  for (const module of modules?.modules ?? []) {
    const entryId = guestModuleId(module.packName, module.moduleId);
    if (module.kind === "host") {
      // A host entry has no guest source of its own either: its specifier
      // resolves to a facade generated from the protocol registry, so the guest
      // surface of a host module is decided by NodeTool, never by the pack.
      const spec = sandboxHostModule(module.hostId);
      if (spec === undefined) {
        throw new Error(
          `${module.specifier}: "${module.hostId}" is not a host module NodeTool implements`
        );
      }
      specifiers.set(module.specifier, entryId);
      sources.set(entryId, generateSandboxHostFacade(module.specifier, spec));
      hostFacades.add(entryId);
      continue;
    }
    if (module.kind === "wasm") {
      // A WASM entry has no guest source of its own: its specifier resolves to
      // a generated facade over the per-run dispatcher. An authored sibling
      // importing "./thing.wasm" lands on the same id, so it gets the same
      // facade.
      specifiers.set(module.specifier, entryId);
      sources.set(entryId, generateSandboxWasmFacade(module.specifier, module.wasm));
      facades.add(entryId);
      continue;
    }
    specifiers.set(module.specifier, entryId);
    sources.set(entryId, module.source);
    for (const file of module.graph) {
      if (file.kind !== "js") continue;
      sources.set(guestModuleId(module.packName, file.id), file.source);
    }
  }
  if (sources.size === 0) return undefined;
  if (facades.size > 0) sources.set(WASM_BRIDGE_MODULE_ID, SANDBOX_WASM_BRIDGE_SOURCE);
  if (hostFacades.size > 0) {
    sources.set(HOST_BRIDGE_MODULE_ID, SANDBOX_HOST_BRIDGE_SOURCE);
  }
  if (platformFacades.size > 0) {
    sources.set(CAPABILITY_BRIDGE_MODULE_ID, SANDBOX_CAPABILITY_BRIDGE_SOURCE);
  }

  const hardening = dropTimersStatement();
  let phase: "bootstrap" | "guest" = "bootstrap";
  let locked = false;
  let denial = "";

  const deny = (message: string): string => {
    denial = message;
    return DENIED_MODULE_ID;
  };

  const resolve = (baseName: string, requested: string): string => {
    if (locked) {
      return deny(
        `dynamic import() is not allowed in the sandbox (requested "${requested}")`
      );
    }
    if (requested === SANDBOX_HOST_BRIDGE_SPECIFIER) {
      if (hostFacades.has(baseName)) return HOST_BRIDGE_MODULE_ID;
      return deny(
        `"${SANDBOX_HOST_BRIDGE_SPECIFIER}" is private to the sandbox's generated host facades and cannot be imported`
      );
    }
    if (requested === SANDBOX_CAPABILITY_BRIDGE_SPECIFIER) {
      if (platformFacades.has(baseName)) return CAPABILITY_BRIDGE_MODULE_ID;
      return deny(
        `"${SANDBOX_CAPABILITY_BRIDGE_SPECIFIER}" is private to the sandbox's generated capability facades and cannot be imported`
      );
    }
    if (requested === SANDBOX_WASM_BRIDGE_SPECIFIER) {
      if (facades.has(baseName)) return WASM_BRIDGE_MODULE_ID;
      return deny(
        `"${SANDBOX_WASM_BRIDGE_SPECIFIER}" is private to the sandbox's generated WASM facades and cannot be imported`
      );
    }
    const declared = specifiers.get(requested);
    if (declared !== undefined) return declared;
    if (requested.startsWith(".") && baseName.startsWith(GUEST_MODULE_PREFIX)) {
      const separator = baseName.indexOf(GUEST_MODULE_SEPARATOR);
      const pack = baseName.slice(GUEST_MODULE_PREFIX.length, separator);
      const fileId = baseName.slice(separator + 1);
      const target = resolveRelativeFileId(fileId, requested);
      for (const candidate of [target, `${target}.js`, `${target}/index.js`]) {
        const id = guestModuleId(pack, candidate);
        if (sources.has(id)) return id;
      }
      return deny(`"${requested}" is not a file of the ${pack} sandbox package`);
    }
    return deny(
      `"${requested}" is not a sandbox package declared by this node — add it to the node's packages declaration to import it`
    );
  };

  return {
    options: {
      modulePathNormalizer: (baseName, requestedName, context) =>
        phase === "bootstrap"
          ? defaultModulePathNormalizer(baseName, requestedName, context)
          : resolve(baseName, requestedName),
      getModuleLoader: (fs, runtimeOptions) => {
        const fallback = createDefaultModuleLoader(fs, runtimeOptions);
        return (moduleName, context) => {
          if (moduleName === DENIED_MODULE_ID) {
            return { error: new Error(denial) };
          }
          const source = sources.get(moduleName);
          if (source !== undefined) return { value: `${hardening}${source}` };
          if (phase === "bootstrap") return fallback(moduleName, context);
          return { error: new Error(`Module "${moduleName}" is not available`) };
        };
      }
    },
    enterGuestPhase() {
      phase = "guest";
    },
    lockStaticGraph() {
      locked = true;
    }
  };
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
   * the guest unwinds. The QuickJS library exposes no interrupt input of its
   * own, so a purely CPU-bound guest loop still runs to its execution timeout —
   * but `runInSandbox` returns as soon as the signal fires rather than waiting
   * for it.
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
  if (target && typeof target === "object") {
    const t = target as Record<string, unknown>;
    for (const key of Object.keys(t)) delete t[key];
    if (source && typeof source === "object" && !Array.isArray(source)) {
      const s = source as Record<string, unknown>;
      for (const [k, v] of Object.entries(s)) t[k] = v;
    }
  }
}

/**
 * Names injected as bridge bindings into the QuickJS guest. The rest of the
 * `buildSandbox` record (JSON, Math, Date, URL, etc.) is deliberately NOT
 * marshaled — QuickJS already provides native implementations, and re-exposing
 * host versions creates thousands of handles that slow execution and leak on
 * teardown.
 */
export const EXPOSED_BRIDGE_NAMES = [
  "console",
  "fetch",
  "crypto",
  "sleep",
  "getSecret",
  "workspace",
  "assetToSandbox",
  "sandboxToAsset",
  "progress",
  "emit",
  "output",
  "format",
  "image",
  "canvas",
  "media",
  "__maxIter",
  "__secretScope"
] as const;

export type ExposedBridgeName = (typeof EXPOSED_BRIDGE_NAMES)[number];

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
 * Globals the init prelude removes. `eval` and `Function` go so the guest
 * cannot re-enter code generation. The rest are stubs
 * `@sebastianwessel/quickjs` installs unconditionally (its node-compatibility
 * layer and `provideEnv` have no off switch): `Buffer`, `process`, `env`,
 * `Headers`, `Request`, `Response`, `performance`. Nothing in the sandbox's
 * own machinery uses them — the fetch bridge returns plain objects and the
 * guest-to-host serializers dispatch on constructor names no guest code can
 * reach once the classes are gone — so they are deleted to keep the guest
 * surface minimal instead of documented as stubs.
 */
export const DELETED_GUEST_GLOBALS = [
  "eval",
  "Function",
  "Buffer",
  "process",
  "env",
  "Headers",
  "Request",
  "Response",
  "performance"
] as const;

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
    wasmPool
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
  let moduleHost: GuestModuleHost | undefined;
  try {
    wasm = modules
      ? createSandboxWasmDispatcher(modules.modules, {
          ...(wasmPool === undefined ? {} : { pool: wasmPool }),
          ...(signal === undefined ? {} : { signal })
        })
      : undefined;
    hostModules = modules
      ? createSandboxHostDispatcher(modules.modules, {
          ...(signal === undefined ? {} : { signal })
        })
      : undefined;
    moduleHost =
      modules || capabilities
        ? createGuestModuleHost(modules, capabilities?.facades)
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

  const { sandbox, getLogs, getOutputs, getEmitted } = buildSandbox(
    context,
    signal,
    resolvedLimits,
    onProgress,
    onEmit,
    {
      ...(onTakeInput === undefined ? {} : { onTakeInput }),
      ...(onStreamOpen === undefined ? {} : { onStreamOpen }),
      ...(activeClock === undefined ? {} : { clock: activeClock })
    }
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
    .filter(([, v]) => v !== null && typeof v === "object")
    .map(([k]) => k);

  try {
    const { runSandboxed } = await getEngine();

    const sandboxRun = runSandboxed(
      async ({ ctx, evalCode }) => {
        // Past this point the wrapper's own Node-compat bootstrap has run, so
        // nothing else may resolve outside the run's declared modules.
        moduleHost?.enterGuestPhase();
        // A CPU-bound guest never yields to the host event loop, so an abort
        // listener can't fire and Promise.race can't help. QuickJS polls this
        // interrupt handler from inside the interpreter, which is the only
        // mechanism that can stop a spinning loop. Compose cancellation with
        // the library's own wall-clock deadline (it installed one before
        // calling us; replacing it means re-implementing the deadline here).
        // Suspended time is added back, so a program parked on a permission
        // prompt resumes with the budget it had when it asked.
        const deadline = Date.now() + timeoutMs;
        ctx.runtime.setInterruptHandler(
          () =>
            signal?.aborted === true ||
            Date.now() > deadline + (activeClock?.suspendedMs() ?? 0)
        );

        const bridges: Record<string, unknown> = {};
        for (const name of EXPOSED_BRIDGE_NAMES) {
          bridges[name] = sandbox[name];
        }
        // Wrap every async bridge in a never-reject adapter (see
        // SANDBOX_ERROR_MARKER above). The guest prelude rewraps them back into
        // throwing functions before user code runs.
        // guardAbort short-circuits each bridge once the run is cancelled;
        // neverReject keeps the QuickJS handle-leak convention intact.
        const wrap = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
          guardAbort(neverReject(fn), signal);
        bridges.fetch = wrap(bridges.fetch as never);
        bridges.sleep = wrap(bridges.sleep as never);
        bridges.getSecret = wrap(bridges.getSecret as never);
        bridges.assetToSandbox = wrap(bridges.assetToSandbox as never);
        bridges.sandboxToAsset = wrap(bridges.sandboxToAsset as never);
        bridges.emit = wrap(bridges.emit as never);
        bridges.output = wrap(bridges.output as never);
        // The input bridges are not in EXPOSED_BRIDGE_NAMES — the prelude
        // captures them, builds `stream` on top, and deletes them. The take is
        // async like every other host call; the open probe is synchronous and
        // never throws, so it stays unwrapped (the `crypto.randomUUID` rule).
        bridges[SANDBOX_INPUT_TAKE_BINDING] = wrap(
          sandbox[SANDBOX_INPUT_TAKE_BINDING] as never
        );
        bridges[SANDBOX_STREAM_OPEN_BINDING] =
          sandbox[SANDBOX_STREAM_OPEN_BINDING];
        // Object bridges whose members are all async: wrap each member.
        const wrapAllMembers = (bridge: unknown): Record<string, unknown> => {
          const out: Record<string, unknown> = {};
          const members = bridge as Record<
            string,
            (...a: never[]) => Promise<unknown>
          >;
          for (const [name, fn] of Object.entries(members)) {
            out[name] = wrap(fn as never);
          }
          return out;
        };
        bridges.workspace = wrapAllMembers(bridges.workspace);
        bridges.format = wrapAllMembers(bridges.format);
        bridges.image = wrapAllMembers(bridges.image);
        bridges.canvas = wrapAllMembers(bridges.canvas);
        bridges.media = wrapAllMembers(bridges.media);
        const hostCrypto = bridges.crypto as {
          randomUUID: () => string;
          getRandomValues: (n: number) => Record<string, string>;
          digest: (...a: never[]) => Promise<unknown>;
          hmac: (...a: never[]) => Promise<unknown>;
        };
        bridges.crypto = {
          // randomUUID/getRandomValues are synchronous and never throw, so they
          // stay unwrapped; the async pair follows the never-reject convention.
          randomUUID: hostCrypto.randomUUID,
          getRandomValues: hostCrypto.getRandomValues,
          digest: wrap(hostCrypto.digest),
          hmac: wrap(hostCrypto.hmac)
        };
        // The WASM dispatcher rides the same never-reject convention as every
        // other async bridge. It is exposed only when the run declares WASM
        // modules, so a run without them has no such binding at any point.
        if (wasm !== undefined) {
          const dispatcher = wasm;
          bridges[SANDBOX_WASM_BRIDGE_BINDING] = wrap(
            async (moduleKey: unknown, exportName: unknown, args: unknown) =>
              dispatcher.call(moduleKey, exportName, args)
          );
        }
        // Same treatment for host modules, exposed only when the run declares
        // one, so a run without them has no such binding at any point.
        if (hostModules !== undefined) {
          const dispatcher = hostModules;
          bridges[SANDBOX_HOST_BRIDGE_BINDING] = wrap(
            async (moduleKey: unknown, exportName: unknown, args: unknown) =>
              dispatcher.call(moduleKey, exportName, args)
          );
        }
        // And for the platform's own modules, exposed only when the host
        // mounted some — a session with no capability run has no such binding.
        if (capabilities !== undefined) {
          const dispatcher = capabilities;
          bridges[SANDBOX_CAPABILITY_BRIDGE_BINDING] = wrap(
            async (moduleKey: unknown, exportName: unknown, args: unknown) =>
              dispatcher.call(moduleKey, exportName, args)
          );
        }
        // Caller-injected globals are host functions too — guard the async
        // ones or a cancelled run keeps driving real work through them after
        // runInSandbox has returned.
        for (const [name, value] of Object.entries(userGlobals)) {
          bridges[name] =
            typeof value === "function"
              ? wrap(value as (...a: unknown[]) => Promise<unknown>)
              : value;
        }

        // `expose` manages its own internal Scope; the second arg is unused.
        const disposable = new Scope();
        try {
          expose(ctx, disposable, bridges);
        } finally {
          disposable.dispose();
        }

        // Block dynamic code generation and re-wrap the never-reject bridges as
        // throwing guest-side functions. Direct eval in QuickJS can't be neutered
        // by overwriting `globalThis.eval` (QuickJS still resolves the builtin),
        // but a plain `delete` removes the binding entirely so any reference
        // throws ReferenceError — same for `Function`.
        await evalCode(
          `const __marker = "${SANDBOX_ERROR_MARKER}";
const __bytesMarker = "${SANDBOX_BYTES_MARKER}";
const __b64chars = "${BASE64_ALPHABET}";
globalThis.toBase64 = (input) => {
  const b = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let out = "";
  for (let i = 0; i < b.length; i += 3) {
    const c = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    out += __b64chars[(c >> 18) & 63] + __b64chars[(c >> 12) & 63] +
      (i + 1 < b.length ? __b64chars[(c >> 6) & 63] : "=") +
      (i + 2 < b.length ? __b64chars[c & 63] : "=");
  }
  return out;
};
globalThis.fromBase64 = (s) => {
  const clean = String(s).replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array((clean.length * 6) >> 3);
  let acc = 0, bits = 0, o = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | __b64chars.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
  }
  return out;
};
globalThis.toHex = (b) => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
  return s;
};
globalThis.fromHex = (s) => {
  const t = String(s).replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(t.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(t.substr(i * 2, 2), 16);
  return out;
};
globalThis.parallelMap = async (items, fn, concurrency) => {
  if (typeof fn !== "function") {
    throw new TypeError("parallelMap: fn must be a function");
  }
  const list = Array.from(items);
  const raw = Number(concurrency === undefined ? 5 : concurrency);
  const limit = Number.isFinite(raw)
    ? Math.min(Math.max(Math.floor(raw), 1), 32)
    : 5;
  const results = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      results[i] = await fn(list[i], i);
    }
  };
  const workers = [];
  for (let w = 0; w < Math.min(limit, list.length); w++) workers.push(worker());
  await Promise.all(workers);
  return results;
};
const __revive = (v) => (v && typeof v === "object" && typeof v[__bytesMarker] === "string")
  ? globalThis.fromBase64(v[__bytesMarker])
  : v;
const __wrap = (fn) => async (...args) => {
  const r = await fn(...args);
  if (r && r[__marker]) {
    const e = new Error(r.message);
    e.name = r.name;
    throw e;
  }
  return __revive(r);
};
const __rawFetch = __wrap(globalThis.fetch);
globalThis.fetch = async (...args) => {
  const r = await __rawFetch(...args);
  if (r && typeof r === "object") {
    const rb = r.bytes, rab = r.arrayBuffer;
    if (typeof rb === "function") r.bytes = async () => __revive(await rb());
    if (typeof rab === "function") r.arrayBuffer = async () => __revive(await rab()).buffer;
  }
  return r;
};
globalThis.sleep = __wrap(globalThis.sleep);
globalThis.getSecret = __wrap(globalThis.getSecret);
globalThis.assetToSandbox = __wrap(globalThis.assetToSandbox);
globalThis.sandboxToAsset = __wrap(globalThis.sandboxToAsset);
globalThis.emit = __wrap(globalThis.emit);
globalThis.output = __wrap(globalThis.output);
const __ws = globalThis.workspace;
globalThis.workspace = {
  read: __wrap(__ws.read),
  write: __wrap(__ws.write),
  list: __wrap(__ws.list),
  readBytes: __wrap(__ws.readBytes),
  writeBytes: __wrap(__ws.writeBytes),
  stat: __wrap(__ws.stat),
  root: __wrap(__ws.root),
  copy: __wrap(__ws.copy),
  move: __wrap(__ws.move),
  mkdir: __wrap(__ws.mkdir),
  remove: __wrap(__ws.remove)
};
const __fmt = globalThis.format;
globalThis.format = {
  number: __wrap(__fmt.number),
  date: __wrap(__fmt.date),
  relativeTime: __wrap(__fmt.relativeTime),
  list: __wrap(__fmt.list)
};
const __reviveDeep = (v) => {
  const r = __revive(v);
  if (r !== v) return r;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = __reviveDeep(v[i]);
    return v;
  }
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) v[k] = __reviveDeep(v[k]);
    return v;
  }
  return v;
};
const __wrapDeep = (fn) => {
  const wrapped = __wrap(fn);
  return async (...args) => __reviveDeep(await wrapped(...args));
};
const __image = globalThis.image;
globalThis.image = {
  info: __wrapDeep(__image.info),
  decode: __wrapDeep(__image.decode),
  encode: __wrapDeep(__image.encode),
  resize: __wrapDeep(__image.resize),
  crop: __wrapDeep(__image.crop),
  rotate: __wrapDeep(__image.rotate),
  flip: __wrapDeep(__image.flip),
  adjust: __wrapDeep(__image.adjust),
  composite: __wrapDeep(__image.composite),
  convert: __wrapDeep(__image.convert)
};
const __canvasBridge = globalThis.canvas;
globalThis.canvas = {
  render: __wrapDeep(__canvasBridge.render),
  measureText: __wrapDeep(__canvasBridge.measureText)
};
const __mediaBridge = globalThis.media;
const __mediaOut = {};
for (const __m of ${JSON.stringify(MEDIA_REF_MEMBERS)}) {
  __mediaOut[__m] = __wrapDeep(__mediaBridge[__m]);
}
globalThis.media = __mediaOut;
// The input side of emit. An async iterable cannot cross the bridge, so the
// guest builds one over a take-one-value host call: the body pulls, and an item
// it has not asked for stays in the host's inbox. The raw bindings are captured
// and deleted, so \`stream\` is the only way to reach them.
const __takeInput = __wrapDeep(globalThis.${SANDBOX_INPUT_TAKE_BINDING});
const __streamOpen = globalThis.${SANDBOX_STREAM_OPEN_BINDING};
delete globalThis.${SANDBOX_INPUT_TAKE_BINDING};
delete globalThis.${SANDBOX_STREAM_OPEN_BINDING};
const __streamName = (fn, name) => {
  if (typeof name !== "string") {
    throw new TypeError(fn + ": name must be a string");
  }
  return name;
};
// \`handle\` is null for stream.any(), which yields [handle, value] pairs.
const __streamIterable = (handle) => ({
  [Symbol.asyncIterator]: () => ({
    next: async () => {
      const take = await __takeInput(handle);
      if (take.done) return { done: true, value: undefined };
      return {
        done: false,
        value: handle === null ? [take.handle, take.value] : take.value
      };
    }
  })
});
globalThis.stream = (name) => __streamIterable(__streamName("stream", name));
globalThis.stream.any = () => __streamIterable(null);
globalThis.stream.first = async (name) => {
  const take = await __takeInput(__streamName("stream.first", name));
  return take.done ? undefined : take.value;
};
globalThis.stream.open = (name) => {
  const open = __streamOpen(__streamName("stream.open", name));
  // null is the host saying this run has no input stream at all. Every other
  // stream verb reports that by throwing; this one has to do it here, because
  // a synchronous bridge cannot.
  if (open === null) {
    throw new Error(${JSON.stringify(NO_INPUT_STREAM_MESSAGE)});
  }
  return open;
};
const __canvasProps = ${JSON.stringify(CANVAS_PROPERTIES)};
const __canvasMethods = ${JSON.stringify(CANVAS_METHODS)};
const __canvasGradients = ${JSON.stringify(CANVAS_GRADIENT_FACTORIES)};
const __gradMarker = "${CANVAS_GRADIENT_MARKER}";
// A canvas context is a host object with methods, which the bridge contract
// cannot carry. So this records the ordinary Canvas 2D calls synchronously and
// ships the whole draw list in one canvas.render() when toBytes() is awaited.
globalThis.createCanvas = (width, height) => {
  const ops = [];
  const gradients = {};
  let gradientSeq = 0;
  const asStyle = (value) =>
    value && typeof value === "object" && typeof value[__gradMarker] === "string"
      ? { [__gradMarker]: value[__gradMarker] }
      : value;
  const ctx = {};
  for (const name of __canvasMethods) {
    ctx[name] = (...args) => {
      ops.push({ op: name, args });
      return ctx;
    };
  }
  ctx.drawImage = (source, ...rest) => {
    ops.push({ op: "drawImage", args: [source, ...rest] });
    return ctx;
  };
  const values = {};
  for (const prop of __canvasProps) {
    Object.defineProperty(ctx, prop, {
      enumerable: true,
      get: () => values[prop],
      set: (value) => {
        values[prop] = value;
        ops.push({ op: "set", args: [prop, asStyle(value)] });
      }
    });
  }
  for (const factory of Object.keys(__canvasGradients)) {
    ctx[factory] = (...coords) => {
      const id = "g" + gradientSeq++;
      const spec = { type: __canvasGradients[factory], coords, stops: [] };
      gradients[id] = spec;
      const handle = {
        [__gradMarker]: id,
        addColorStop: (offset, color) => {
          spec.stops.push([offset, color]);
          return handle;
        }
      };
      return handle;
    };
  }
  const surface = {
    width,
    height,
    getContext: (kind) => {
      if (kind !== undefined && kind !== "2d") {
        throw new Error('createCanvas: only the "2d" context exists');
      }
      return ctx;
    },
    toSpec: (options) => ({
      width,
      height,
      gradients,
      ops,
      ...(options || {})
    }),
    toBytes: (options) => globalThis.canvas.render(surface.toSpec(options))
  };
  return surface;
};
const __crypto = globalThis.crypto;
globalThis.crypto = {
  randomUUID: () => __crypto.randomUUID(),
  getRandomValues: (n) => {
    const len = Number(n);
    if (!Number.isFinite(len) || len < 0) {
      throw new TypeError("crypto.getRandomValues: length must be a non-negative number");
    }
    return __revive(__crypto.getRandomValues(Math.floor(len)));
  },
  digest: __wrap(__crypto.digest),
  hmac: __wrap(__crypto.hmac)
};
${DELETED_GUEST_GLOBALS.map((n) => `delete globalThis.${n};`).join("\n")}
${
  wasm === undefined
    ? ""
    : `globalThis.${SANDBOX_WASM_DISPATCH_GLOBAL} = __wrap(globalThis.${SANDBOX_WASM_BRIDGE_BINDING});
delete globalThis.${SANDBOX_WASM_BRIDGE_BINDING};`
}
${
  hostModules === undefined
    ? ""
    : `globalThis.${SANDBOX_HOST_DISPATCH_GLOBAL} = __wrapDeep(globalThis.${SANDBOX_HOST_BRIDGE_BINDING});
delete globalThis.${SANDBOX_HOST_BRIDGE_BINDING};`
}
${
  capabilities === undefined
    ? ""
    : `globalThis.${SANDBOX_CAPABILITY_DISPATCH_GLOBAL} = __wrapDeep(globalThis.${SANDBOX_CAPABILITY_BRIDGE_BINDING});
delete globalThis.${SANDBOX_CAPABILITY_BRIDGE_BINDING};`
}
export default true;`,
          "sandbox-init"
        );

        // `evalCode` compiles and links the module — resolving its whole static
        // import graph — before its first await, so a resolution that arrives
        // after this call has returned can only come from a dynamic `import()`.
        // The dispatcher binding lives only long enough for the bridge module
        // to capture it while the entry's static graph links. This deletion is
        // the entry module's first statement, so it runs after every imported
        // module has evaluated and before the user IIFE starts.
        const pendingUserResult = evalCode(
          buildEntryModule(
            code,
            `${
              wasm === undefined
                ? ""
                : ` delete globalThis.${SANDBOX_WASM_DISPATCH_GLOBAL};`
            }${
              hostModules === undefined
                ? ""
                : ` delete globalThis.${SANDBOX_HOST_DISPATCH_GLOBAL};`
            }${
              capabilities === undefined
                ? ""
                : ` delete globalThis.${SANDBOX_CAPABILITY_DISPATCH_GLOBAL};`
            }`
          ),
          "user-code"
        );
        moduleHost?.lockStaticGraph();
        const userResult = await pendingUserResult;

        // Sync mutable globals back to the host. node:vm shared the host heap,
        // so `state.counter++` in user code mutated the caller's object directly.
        // With QuickJS the guest heap is isolated, so after user code runs we
        // extract the current values of the object-typed user globals and
        // replace the contents of the host-side objects in place. CodeNode
        // relies on this to make its `state` object persist across invocations.
        if (syncTargetNames.length > 0) {
          const extractor = `export default {${syncTargetNames
            .map(
              (n) =>
                `${n}: (typeof ${n} !== 'undefined' && ${n} !== null) ? ${n} : null`
            )
            .join(", ")}};`;
          const syncResp = await evalCode(extractor, "sandbox-sync");
          if (
            syncResp.ok &&
            syncResp.data &&
            typeof syncResp.data === "object"
          ) {
            const extracted = syncResp.data as Record<string, unknown>;
            for (const name of syncTargetNames) {
              const hostValue = userGlobals[name] as unknown;
              const guestValue = extracted[name];
              if (
                hostValue !== null &&
                typeof hostValue === "object" &&
                guestValue !== null &&
                typeof guestValue === "object"
              ) {
                replaceInPlace(hostValue, guestValue);
              }
            }
          }
        }

        return userResult;
      },
      {
        // The engine's own abort is a plain `setTimeout` armed when evaluation
        // starts — it cannot be paused. With a clock in play it becomes the
        // backstop for a run that stays suspended forever, while the interrupt
        // handler above keeps the exact bound on guest execution.
        executionTimeout: activeClock
          ? Math.min(
              timeoutMs + Math.max(0, suspendAllowanceMs),
              MAX_ENGINE_TIMEOUT_MS
            )
          : timeoutMs,
        memoryLimit: resolvedLimits.memoryLimitBytes,
        maxStackSize: resolvedLimits.stackLimitBytes,
        // The library defaults this to `{NODE_DEBUG: "true"}`, which reaches
        // the guest as `process.env` and can flip debug paths in its `node:util`
        // polyfill. Guest code has no business reading host-shaped environment
        // variables, so the stub carries nothing.
        env: {},
        ...moduleHost?.options
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
    const raced = await Promise.race([sandboxRun, cancellation]);
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
      // Include the error name alongside the message when the name carries
      // useful signal (e.g. `ExecutionTimeout` for the library's wall-clock
      // abort). `Error` is redundant, so omit it.
      const name = evalResponse.error.name;
      const message = evalResponse.error.message;
      const combined =
        name &&
        name !== "Error" &&
        !message.toLowerCase().includes(name.toLowerCase())
          ? `${name}: ${message}`
          : message || name;
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
    // Host-side failures (engine load error, marshaling bug, etc.). Guest-side
    // errors go through evalResponse.ok=false above.
    const logs = getLogs();
    const errorMessage = e instanceof Error ? e.message : String(e);
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
