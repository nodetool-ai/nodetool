/**
 * Shared sandboxed JavaScript execution engine.
 *
 * Used by both the MiniJSAgentTool (agent tool) and the CodeNode (workflow node).
 * Runs user code in an isolated QuickJS WebAssembly context — the guest has its
 * own heap inside the WASM instance, so there is a real memory/CPU boundary
 * between host and guest (unlike Node's `node:vm`, which shares the V8 heap).
 *
 * The exposed surface is a small curated one: vanilla JavaScript plus a handful
 * of bridge functions (`fetch`, `workspace`, `getSecret`, `uuid`, `sleep`,
 * `assetToSandbox`, `sandboxToAsset`, `crypto`, `console`) and a few pure
 * guest-side binary helpers (`toBase64`, `fromBase64`, `toHex`, `fromHex`,
 * `utf8Encode`, `utf8Decode`). `crypto` covers `randomUUID`,
 * `getRandomValues`, `digest`, and `hmac` (WebCrypto-backed);
 * `workspace` covers text and binary reads/writes plus `stat`, `mkdir`, and
 * `remove`. Every quantitative limit (fetch calls, response body, output size,
 * guest heap, stack, fetch timeout) is overridable per invocation through
 * `RunSandboxOptions.limits`, clamped to hard ceilings. Library-powered helpers
 * (lodash, dayjs, cheerio, csv-parse,
 * validator) are intentionally NOT exposed here — use the dedicated workflow
 * nodes instead (lib.datetime.*, lib.html.*, lib.data.ParseCSV,
 * lib.validate.*, etc.). Keeping the sandbox lib-free makes snippet behaviour
 * identical between dev and packaged Electron, and avoids shipping those
 * packages into the user-code surface.
 */

import { addSerializer, expose, loadQuickJs } from "@sebastianwessel/quickjs";
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
/** Largest `crypto.getRandomValues` request the bridge will serve. */
export const MAX_RANDOM_BYTES = 65_536;

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
}

export type ResolvedSandboxLimits = Required<SandboxLimits>;

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
    )
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

/**
 * Marker key carrying base64 bytes from host to guest. Host→guest is the
 * asymmetric direction: a guest `Uint8Array` reaches the host as a native one
 * (see the typed-array serializers), but a host `Uint8Array` returned through
 * `expose` arrives in the guest as a plain numeric-keyed object — indexable,
 * yet not a real typed array. Bridges that produce binary therefore return
 * `{ [SANDBOX_BYTES_MARKER]: "<base64>" }` and the guest prelude reconstructs a
 * genuine `Uint8Array`, so the guest-visible API is binary all the way through.
 */
const SANDBOX_BYTES_MARKER = "__nodetool_sandbox_bytes__";

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const c =
      (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out +=
      BASE64_ALPHABET[(c >> 18) & 63] +
      BASE64_ALPHABET[(c >> 12) & 63] +
      (i + 1 < bytes.length ? BASE64_ALPHABET[(c >> 6) & 63] : "=") +
      (i + 2 < bytes.length ? BASE64_ALPHABET[c & 63] : "=");
  }
  return out;
}

/** Tag bytes for the guest prelude to turn back into a real `Uint8Array`. */
function toGuestBytes(bytes: Uint8Array): Record<string, string> {
  return { [SANDBOX_BYTES_MARKER]: encodeBase64(bytes) };
}

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

/** True if a literal IPv4/IPv6 host is loopback, link-local, or private. */
function isBlockedIpLiteral(host: string): boolean {
  // Strip IPv6 brackets/zone id.
  const h = host
    .replace(/^\[|\]$/g, "")
    .split("%")[0]
    .toLowerCase();
  // IPv4 (incl. IPv4-mapped IPv6 like ::ffff:127.0.0.1)
  const v4 = h.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4) {
    const [a, b] = v4[1].split(".").map(Number);
    if (a === 127 || a === 10 || a === 0) return true; // loopback, private, this-host
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  // IPv6
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local fc00::/7
  return false;
}

/**
 * SSRF allow-check for the sandbox fetch bridge. Rejects non-http(s) schemes
 * and hosts that resolve to loopback/link-local/private literals or localhost.
 * Throws on a blocked URL.
 */
function assertFetchUrlAllowed(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("fetch: invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`fetch: unsupported scheme "${parsed.protocol}"`);
  }
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
    let hasBinary = false;
    if (Array.isArray(result)) {
      hasBinary = result.some(isTypedArray);
    } else {
      for (const v of Object.values(result as Record<string, unknown>)) {
        if (isTypedArray(v)) {
          hasBinary = true;
          break;
        }
      }
    }
    if (hasBinary) {
      if (Array.isArray(result)) {
        return result.map((v) => (isTypedArray(v) ? toNativeUint8Array(v) : v));
      }
      const obj = result as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = isTypedArray(v) ? toNativeUint8Array(v) : v;
      }
      return out;
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
 */
export function buildSandbox(
  context?: ProcessingContext,
  signal?: AbortSignal,
  limits?: SandboxLimits
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
    assertFetchUrlAllowed(url);

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

      if (options?.headers && typeof options.headers === "object") {
        fetchOptions.headers = options.headers as Record<string, string>;
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

      const response = await fetch(url, fetchOptions);
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

  const uuid = () => globalThis.crypto.randomUUID();

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

  const getSecret = context
    ? async (name: string): Promise<string | undefined> => {
        return (await context.getSecret(name)) ?? undefined;
      }
    : async (_name: string): Promise<string | undefined> => {
        return undefined;
      };

  const workspace = context
    ? {
        read: async (path: string): Promise<string> => {
          const fullPath = context.resolveWorkspacePath(path);
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          await assertWorkspaceContained(
            context,
            fs,
            nodePath,
            fullPath,
            false
          );
          return fs.readFile(fullPath, "utf-8");
        },
        write: async (path: string, content: string): Promise<void> => {
          const fullPath = context.resolveWorkspacePath(path);
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          await assertWorkspaceContained(context, fs, nodePath, fullPath, true);
          await fs.mkdir(nodePath.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content, "utf-8");
        },
        list: async (path: string): Promise<string[]> => {
          const fullPath = context.resolveWorkspacePath(path);
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          await assertWorkspaceContained(
            context,
            fs,
            nodePath,
            fullPath,
            false
          );
          return fs.readdir(fullPath);
        },
        readBytes: async (path: string): Promise<Record<string, string>> => {
          const fullPath = context.resolveWorkspacePath(path);
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          await assertWorkspaceContained(
            context,
            fs,
            nodePath,
            fullPath,
            false
          );
          return toGuestBytes(new Uint8Array(await fs.readFile(fullPath)));
        },
        writeBytes: async (path: string, data: unknown): Promise<void> => {
          const fullPath = context.resolveWorkspacePath(path);
          const bytes =
            data instanceof Uint8Array ? data : toNativeUint8Array(data);
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          await assertWorkspaceContained(context, fs, nodePath, fullPath, true);
          await fs.mkdir(nodePath.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, bytes);
        },
        stat: async (path: string): Promise<Record<string, unknown>> => {
          const fullPath = context.resolveWorkspacePath(path);
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          await assertWorkspaceContained(
            context,
            fs,
            nodePath,
            fullPath,
            false
          );
          const info = await fs.stat(fullPath);
          return {
            size: info.size,
            isDirectory: info.isDirectory(),
            isFile: info.isFile(),
            modifiedMs: info.mtimeMs
          };
        },
        mkdir: async (path: string): Promise<void> => {
          const fullPath = context.resolveWorkspacePath(path);
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          await assertWorkspaceContained(context, fs, nodePath, fullPath, true);
          await fs.mkdir(fullPath, { recursive: true });
        },
        remove: async (path: string): Promise<void> => {
          const fullPath = context.resolveWorkspacePath(path);
          const fs = await loadFsPromises();
          const nodePath = await loadNodePath();
          // Treated as a write for containment. `recursive: false` keeps this
          // to one file or one empty directory — guest code cannot delete a
          // whole workspace subtree in a single call.
          await assertWorkspaceContained(context, fs, nodePath, fullPath, true);
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
    // Async primitives blocked — use sleep() instead.
    setTimeout: undefined,
    setInterval: undefined,
    // Bridge functions — the only non-native surface the sandbox exposes.
    fetch: sandboxedFetch,
    crypto: sandboxCrypto,
    uuid,
    sleep,
    getSecret,
    workspace,
    assetToSandbox,
    sandboxToAsset,
    __maxIter: MAX_LOOP_ITERATIONS
  };

  return { sandbox, getLogs: () => logs };
}

// ---------------------------------------------------------------------------
// Code execution
// ---------------------------------------------------------------------------

/**
 * Wrap user code as the default export of an ES module with a top-level-awaited
 * async IIFE body, so `return <value>` inside the snippet becomes the module's
 * default export and `await` at the top level works.
 */
export function wrapCode(code: string): string {
  return `export default await (async () => {
${code}
})();`;
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
}

export interface RunSandboxResult {
  success: boolean;
  result?: unknown;
  error?: string;
  stack?: string;
  logs?: string[];
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

/** Names that should never be reassigned via `globals` — core sandbox APIs. */
const RESERVED_SANDBOX_NAMES = new Set([
  "console",
  "fetch",
  "crypto",
  "uuid",
  "sleep",
  "getSecret",
  "workspace",
  "assetToSandbox",
  "sandboxToAsset",
  // Pure guest-side helpers defined by the prelude.
  "toBase64",
  "fromBase64",
  "toHex",
  "fromHex",
  "utf8Encode",
  "utf8Decode",
  "__maxIter"
]);

/**
 * Names injected as bridge bindings into the QuickJS guest. The rest of the
 * `buildSandbox` record (JSON, Math, Date, URL, etc.) is deliberately NOT
 * marshaled — QuickJS already provides native implementations, and re-exposing
 * host versions creates thousands of handles that slow execution and leak on
 * teardown.
 */
const EXPOSED_BRIDGE_NAMES = [
  "console",
  "fetch",
  "crypto",
  "uuid",
  "sleep",
  "getSecret",
  "workspace",
  "assetToSandbox",
  "sandboxToAsset",
  "__maxIter"
] as const;

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
    limits
  } = options;
  const resolvedLimits = resolveSandboxLimits(limits);

  if (!code.trim()) {
    return { success: false, error: "No code provided", logs: [] };
  }

  if (signal?.aborted) {
    return { success: false, error: "Execution cancelled", logs: [] };
  }

  const { sandbox, getLogs } = buildSandbox(context, signal, resolvedLimits);

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
        // A CPU-bound guest never yields to the host event loop, so an abort
        // listener can't fire and Promise.race can't help. QuickJS polls this
        // interrupt handler from inside the interpreter, which is the only
        // mechanism that can stop a spinning loop. Compose cancellation with
        // the library's own wall-clock deadline (it installed one before
        // calling us; replacing it means re-implementing the deadline here).
        const deadline = Date.now() + timeoutMs;
        ctx.runtime.setInterruptHandler(
          () => signal?.aborted === true || Date.now() > deadline
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
        const ws = bridges.workspace as Record<
          string,
          (...a: never[]) => Promise<unknown>
        >;
        const wrappedWorkspace: Record<string, unknown> = {};
        for (const [name, fn] of Object.entries(ws)) {
          wrappedWorkspace[name] = wrap(fn as never);
        }
        bridges.workspace = wrappedWorkspace;
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
        // Caller-injected globals (ScriptRunner's __runAgent/__log/…) are host
        // functions too — guard the async ones or a cancelled script keeps
        // driving real work through them after runInSandbox has returned.
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
const __hasTE = typeof TextEncoder === "function";
globalThis.utf8Encode = (s) => {
  if (__hasTE) return new TextEncoder().encode(String(s));
  const esc = encodeURIComponent(String(s));
  const out = [];
  for (let i = 0; i < esc.length; i++) {
    if (esc[i] === "%") { out.push(parseInt(esc.substr(i + 1, 2), 16)); i += 2; }
    else out.push(esc.charCodeAt(i));
  }
  return new Uint8Array(out);
};
globalThis.utf8Decode = (b) => {
  if (__hasTE) return new TextDecoder().decode(b instanceof Uint8Array ? b : Uint8Array.from(b));
  let esc = "";
  for (let i = 0; i < b.length; i++) esc += "%" + (b[i] < 16 ? "0" : "") + b[i].toString(16);
  return decodeURIComponent(esc);
};
globalThis.toBase64 = (input) => {
  const b = typeof input === "string" ? globalThis.utf8Encode(input) : input;
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
const __ws = globalThis.workspace;
globalThis.workspace = {
  read: __wrap(__ws.read),
  write: __wrap(__ws.write),
  list: __wrap(__ws.list),
  readBytes: __wrap(__ws.readBytes),
  writeBytes: __wrap(__ws.writeBytes),
  stat: __wrap(__ws.stat),
  mkdir: __wrap(__ws.mkdir),
  remove: __wrap(__ws.remove)
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
delete globalThis.eval;
delete globalThis.Function;
export default true;`,
          "sandbox-init"
        );

        const userResult = await evalCode(wrapCode(code), "user-code");

        // Sync mutable globals back to the host. node:vm shared the host heap,
        // so `state.counter++` in user code mutated the caller's object directly.
        // With QuickJS the guest heap is isolated, so after user code runs we
        // extract the current values of the object-typed user globals and
        // replace the contents of the host-side objects in place. CodeNode
        // relies on this to make its `state` object persist across invocations.
        if (userResult.ok && syncTargetNames.length > 0) {
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
        executionTimeout: timeoutMs,
        memoryLimit: resolvedLimits.memoryLimitBytes,
        maxStackSize: resolvedLimits.stackLimitBytes
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
        logs: getLogs()
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
        logs: logs.length > 0 ? logs : undefined
      };
    }

    return {
      success: true,
      result: serializeResult(evalResponse.data, resolvedLimits.maxOutputSize),
      logs: logs.length > 0 ? logs : undefined
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
      logs: logs.length > 0 ? logs : undefined
    };
  }
}
