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
 * `console`). Library-powered helpers (lodash, dayjs, cheerio, csv-parse,
 * validator) are intentionally NOT exposed here — use the dedicated workflow
 * nodes instead (lib.datetime.*, lib.html.*, lib.data.ParseCSV,
 * lib.validate.*, etc.). Keeping the sandbox lib-free makes snippet behaviour
 * identical between dev and packaged Electron, and avoids shipping those
 * packages into the user-code surface.
 */

import {
  addSerializer,
  expose,
  loadQuickJs
} from "@sebastianwessel/quickjs";
// The variant package uses a `default` export. With `esModuleInterop` this
// typechecks as a namespace, so reach through `.default` explicitly.
import * as quickJsVariantModule from "@jitl/quickjs-ng-wasmfile-release-sync";
const quickJsVariant = (quickJsVariantModule as unknown as {
  default: Parameters<typeof loadQuickJs>[0];
}).default;
import { Scope } from "quickjs-emscripten-core";
import type { ProcessingContext } from "@nodetool/runtime";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n...[truncated]";
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
  return name === "Uint8Array" || name === "Buffer" ||
    name === "Int8Array" || name === "Uint8ClampedArray" ||
    name === "Int16Array" || name === "Uint16Array" ||
    name === "Int32Array" || name === "Uint32Array" ||
    name === "Float32Array" || name === "Float64Array" ||
    name === "ArrayBuffer";
}

function toNativeUint8Array(value: unknown): Uint8Array {
  const v = value as { length?: number; byteLength?: number; [i: number]: number };
  const len = v.length ?? v.byteLength ?? 0;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = v[i] ?? 0;
  return arr;
}

/**
 * Recursively serialize a value returned from the sandbox, converting typed
 * arrays to native Uint8Array and enforcing output size limits.
 */
export function serializeResult(result: unknown): unknown {
  if (result === undefined) return null;
  if (result === null) return null;
  if (
    typeof result === "string" ||
    typeof result === "number" ||
    typeof result === "boolean"
  ) {
    if (typeof result === "string" && result.length > MAX_OUTPUT_SIZE) {
      return truncate(result, MAX_OUTPUT_SIZE);
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
        if (isTypedArray(v)) { hasBinary = true; break; }
      }
    }
    if (hasBinary) {
      if (Array.isArray(result)) {
        return result.map(v => isTypedArray(v) ? toNativeUint8Array(v) : v);
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
      if (json.length > MAX_OUTPUT_SIZE) {
        return truncate(json, MAX_OUTPUT_SIZE);
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
 */
export function buildSandbox(context?: ProcessingContext): SandboxResult {
  const logs: string[] = [];
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
    if (fetchCount > MAX_FETCH_CALLS) {
      throw new Error(
        `Fetch limit exceeded (max ${MAX_FETCH_CALLS} requests per execution)`
      );
    }
    if (typeof url !== "string" || !url) {
      throw new Error("fetch: url must be a non-empty string");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const fetchOptions: RequestInit = {
        method: (options?.method as string) ?? "GET",
        signal: controller.signal
      };

      if (options?.headers && typeof options.headers === "object") {
        fetchOptions.headers = options.headers as Record<string, string>;
      }
      if (options?.body !== undefined) {
        fetchOptions.body =
          typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body);
      }

      const response = await fetch(url, fetchOptions);
      const rawBytes = new Uint8Array(await response.arrayBuffer());
      const ok = response.ok;
      const status = response.status;
      const statusText = response.statusText;
      const headers = Object.fromEntries(response.headers.entries());

      let cachedText: string | null = null;
      const getText = (): string => {
        if (cachedText === null) {
          const decoded = new TextDecoder().decode(rawBytes);
          cachedText =
            decoded.length > MAX_RESPONSE_BODY_SIZE
              ? decoded.slice(0, MAX_RESPONSE_BODY_SIZE) + "...[truncated]"
              : decoded;
        }
        return cachedText;
      };

      let parsedJson: unknown;
      try { parsedJson = JSON.parse(getText()); } catch { parsedJson = undefined; }

      return {
        ok,
        status,
        statusText,
        headers,
        body: getText(),
        json: parsedJson,
        text: async () => getText(),
        arrayBuffer: async () => rawBytes.buffer.slice(
          rawBytes.byteOffset,
          rawBytes.byteOffset + rawBytes.byteLength
        ),
        bytes: async () => rawBytes
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const uuid = () => crypto.randomUUID();

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
          const { readFile } = await import("node:fs/promises");
          return readFile(fullPath, "utf-8");
        },
        write: async (path: string, content: string): Promise<void> => {
          const fullPath = context.resolveWorkspacePath(path);
          const { writeFile, mkdir } = await import("node:fs/promises");
          const { dirname } = await import("node:path");
          await mkdir(dirname(fullPath), { recursive: true });
          await writeFile(fullPath, content, "utf-8");
        },
        list: async (path: string): Promise<string[]> => {
          const fullPath = context.resolveWorkspacePath(path);
          const { readdir } = await import("node:fs/promises");
          return readdir(fullPath);
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
        }
      };

  const sleep = (ms: number): Promise<void> => {
    const capped = Math.min(ms, 5000);
    return new Promise((resolve) => setTimeout(resolve, capped));
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
    uuid,
    sleep,
    getSecret,
    workspace,
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
  "uuid",
  "sleep",
  "getSecret",
  "workspace",
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
  "uuid",
  "sleep",
  "getSecret",
  "workspace",
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
  const { code, context, timeoutMs = DEFAULT_TIMEOUT_MS, globals } = options;

  if (!code.trim()) {
    return { success: false, error: "No code provided", logs: [] };
  }

  const { sandbox, getLogs } = buildSandbox(context);

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

    const evalResponse = await runSandboxed(async ({ ctx, evalCode }) => {
      const bridges: Record<string, unknown> = {};
      for (const name of EXPOSED_BRIDGE_NAMES) {
        bridges[name] = sandbox[name];
      }
      // Wrap every async bridge in a never-reject adapter (see
      // SANDBOX_ERROR_MARKER above). The guest prelude rewraps them back into
      // throwing functions before user code runs.
      bridges.fetch = neverReject(bridges.fetch as never);
      bridges.sleep = neverReject(bridges.sleep as never);
      bridges.getSecret = neverReject(bridges.getSecret as never);
      const ws = bridges.workspace as {
        read: (p: string) => Promise<string>;
        write: (p: string, c: string) => Promise<void>;
        list: (p: string) => Promise<string[]>;
      };
      bridges.workspace = {
        read: neverReject(ws.read),
        write: neverReject(ws.write),
        list: neverReject(ws.list)
      };
      Object.assign(bridges, userGlobals);

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
const __wrap = (fn) => async (...args) => {
  const r = await fn(...args);
  if (r && r[__marker]) {
    const e = new Error(r.message);
    e.name = r.name;
    throw e;
  }
  return r;
};
globalThis.fetch = __wrap(globalThis.fetch);
globalThis.sleep = __wrap(globalThis.sleep);
globalThis.getSecret = __wrap(globalThis.getSecret);
const __ws = globalThis.workspace;
globalThis.workspace = {
  read: __wrap(__ws.read),
  write: __wrap(__ws.write),
  list: __wrap(__ws.list)
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
        if (syncResp.ok && syncResp.data && typeof syncResp.data === "object") {
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
    }, {
      executionTimeout: timeoutMs,
      memoryLimit: GUEST_MEMORY_LIMIT,
      maxStackSize: GUEST_STACK_LIMIT
    });

    const logs = getLogs();

    if (!evalResponse.ok) {
      // Include the error name alongside the message when the name carries
      // useful signal (e.g. `ExecutionTimeout` for the library's wall-clock
      // abort). `Error` is redundant, so omit it.
      const name = evalResponse.error.name;
      const message = evalResponse.error.message;
      const combined =
        name && name !== "Error" && !message.toLowerCase().includes(name.toLowerCase())
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
      result: serializeResult(evalResponse.data),
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
