/**
 * Shared sandboxed JavaScript execution engine.
 *
 * Used by both the MiniJSAgentTool (agent tool) and the CodeNode (workflow node).
 * Runs user code in an isolated `vm` context with curated APIs and safety limits.
 */

import * as vm from "node:vm";
import type { ProcessingContext } from "@nodetool/runtime";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_SIZE = 100_000;
export const MAX_LOOP_ITERATIONS = 10_000;
export const MAX_FETCH_CALLS = 20;
export const MAX_RESPONSE_BODY_SIZE = 1_000_000;

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

export function cleanStack(stack: string): string {
  return stack
    .split("\n")
    .filter(
      (line) =>
        line.includes("agent-js") ||
        line.includes("evalmachine") ||
        (!line.includes("node:") && !line.includes("node_modules")),
    )
    .slice(0, 5)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Sandbox builder
// ---------------------------------------------------------------------------

export interface SandboxResult {
  sandbox: Record<string, unknown>;
  getLogs: () => string[];
}

/**
 * Build a sandboxed global context with curated APIs.
 *
 * @param context  Optional ProcessingContext — when provided, enables
 *                 `workspace.*` and `getSecret()` APIs.
 */
export function buildSandbox(context?: ProcessingContext): SandboxResult {
  const logs: string[] = [];
  let fetchCount = 0;

  // Console replacement that captures output
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
    },
  };

  // Sandboxed fetch with limits
  const sandboxedFetch = async (
    url: string,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    fetchCount++;
    if (fetchCount > MAX_FETCH_CALLS) {
      throw new Error(
        `Fetch limit exceeded (max ${MAX_FETCH_CALLS} requests per execution)`,
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
        signal: controller.signal,
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
      const text = await response.text();
      const body =
        text.length > MAX_RESPONSE_BODY_SIZE
          ? text.slice(0, MAX_RESPONSE_BODY_SIZE) + "...[truncated]"
          : text;

      // Try to parse as JSON
      let json: unknown = undefined;
      try {
        json = JSON.parse(body);
      } catch {
        // not JSON, that's fine
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body,
        json,
      };
    } finally {
      clearTimeout(timer);
    }
  };

  // URL helpers
  const urlHelpers = {
    encode: (s: string) => encodeURIComponent(s),
    decode: (s: string) => decodeURIComponent(s),
    parse: (s: string) => {
      const u = new URL(s);
      return {
        href: u.href,
        origin: u.origin,
        protocol: u.protocol,
        host: u.host,
        hostname: u.hostname,
        port: u.port,
        pathname: u.pathname,
        search: u.search,
        hash: u.hash,
        params: Object.fromEntries(u.searchParams.entries()),
      };
    },
    build: (
      base: string,
      params?: Record<string, string | number | boolean>,
    ) => {
      const u = new URL(base);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          u.searchParams.set(k, String(v));
        }
      }
      return u.toString();
    },
  };

  // Date/time helpers
  const dateHelpers = {
    now: () => Date.now(),
    iso: () => new Date().toISOString(),
    parse: (s: string) => new Date(s).getTime(),
    format: (ts: number) => new Date(ts).toISOString(),
    diff: (a: string, b: string) =>
      new Date(a).getTime() - new Date(b).getTime(),
  };

  // Crypto/hash helpers (simple)
  const hashHelpers = {
    uuid: () => crypto.randomUUID(),
    random: (min = 0, max = 1) => Math.random() * (max - min) + min,
    randomInt: (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min,
  };

  // String helpers
  const strHelpers = {
    trim: (s: string) => s.trim(),
    upper: (s: string) => s.toUpperCase(),
    lower: (s: string) => s.toLowerCase(),
    split: (s: string, sep: string) => s.split(sep),
    join: (arr: string[], sep: string) => arr.join(sep),
    replace: (s: string, search: string, replacement: string) =>
      s.replace(new RegExp(search, "g"), replacement),
    match: (s: string, pattern: string) => s.match(new RegExp(pattern, "g")),
    includes: (s: string, sub: string) => s.includes(sub),
    startsWith: (s: string, sub: string) => s.startsWith(sub),
    endsWith: (s: string, sub: string) => s.endsWith(sub),
    padStart: (s: string, len: number, fill?: string) =>
      s.padStart(len, fill),
    padEnd: (s: string, len: number, fill?: string) => s.padEnd(len, fill),
    repeat: (s: string, n: number) => s.repeat(Math.min(n, 10000)),
    slice: (s: string, start: number, end?: number) => s.slice(start, end),
    lines: (s: string) => s.split("\n"),
    chars: (s: string) => [...s],
    reverse: (s: string) => [...s].reverse().join(""),
    truncate: (s: string, max: number, suffix = "...") =>
      s.length > max ? s.slice(0, max) + suffix : s,
  };

  // Array helpers
  const arrHelpers = {
    range: (start: number, end: number, step = 1) => {
      const result: number[] = [];
      const s = step > 0 ? step : 1;
      for (
        let i = start;
        i < end && result.length < MAX_LOOP_ITERATIONS;
        i += s
      ) {
        result.push(i);
      }
      return result;
    },
    unique: (arr: unknown[]) => [...new Set(arr)],
    flatten: (arr: unknown[]) => (arr as unknown[][]).flat(Infinity),
    chunk: (arr: unknown[], size: number) => {
      const chunks: unknown[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    },
    zip: (...arrays: unknown[][]) => {
      const minLen = Math.min(...arrays.map((a) => a.length));
      return Array.from({ length: minLen }, (_, i) =>
        arrays.map((a) => a[i]),
      );
    },
    groupBy: (arr: Record<string, unknown>[], key: string) => {
      const groups: Record<string, unknown[]> = {};
      for (const item of arr) {
        const k = String(item[key] ?? "undefined");
        if (!groups[k]) groups[k] = [];
        groups[k].push(item);
      }
      return groups;
    },
    sortBy: (arr: Record<string, unknown>[], key: string, desc = false) => {
      return [...arr].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av ?? "").localeCompare(String(bv ?? ""));
        return desc ? -cmp : cmp;
      });
    },
    sum: (arr: number[]) => arr.reduce((a, b) => a + b, 0),
    avg: (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
    min: (arr: number[]) => Math.min(...arr),
    max: (arr: number[]) => Math.max(...arr),
    count: (arr: unknown[], pred?: (item: unknown) => boolean) =>
      pred ? arr.filter(pred).length : arr.length,
    pluck: (arr: Record<string, unknown>[], key: string) =>
      arr.map((item) => item[key]),
  };

  // Object helpers
  const objHelpers = {
    keys: (obj: Record<string, unknown>) => Object.keys(obj),
    values: (obj: Record<string, unknown>) => Object.values(obj),
    entries: (obj: Record<string, unknown>) => Object.entries(obj),
    fromEntries: (entries: [string, unknown][]) => Object.fromEntries(entries),
    pick: (obj: Record<string, unknown>, keys: string[]) => {
      const result: Record<string, unknown> = {};
      for (const k of keys) {
        if (k in obj) result[k] = obj[k];
      }
      return result;
    },
    omit: (obj: Record<string, unknown>, keys: string[]) => {
      const excluded = new Set(keys);
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (!excluded.has(k)) result[k] = v;
      }
      return result;
    },
    merge: (...objs: Record<string, unknown>[]) => Object.assign({}, ...objs),
    deepClone: (obj: unknown) => JSON.parse(JSON.stringify(obj)),
    get: (obj: Record<string, unknown>, path: string) => {
      const parts = path.split(".");
      let current: unknown = obj;
      for (const part of parts) {
        if (current == null || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[part];
      }
      return current;
    },
    set: (obj: Record<string, unknown>, path: string, value: unknown) => {
      const parts = path.split(".");
      let current: Record<string, unknown> = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || typeof current[part] !== "object") {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
      return obj;
    },
  };

  // Secret accessor (requires context)
  const getSecret = context
    ? async (name: string): Promise<string | undefined> => {
        return context.getSecret(name);
      }
    : async (_name: string): Promise<string | undefined> => {
        return undefined;
      };

  // Workspace file ops (requires context)
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
        },
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
      };

  // Sleep helper
  const sleep = (ms: number): Promise<void> => {
    const capped = Math.min(ms, 5000);
    return new Promise((resolve) => setTimeout(resolve, capped));
  };

  const sandbox: Record<string, unknown> = {
    // Core JS globals (safe subset)
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
    // Async
    setTimeout: undefined, // blocked
    setInterval: undefined, // blocked
    // API surface
    fetch: sandboxedFetch,
    url: urlHelpers,
    date: dateHelpers,
    hash: hashHelpers,
    str: strHelpers,
    arr: arrHelpers,
    obj: objHelpers,
    sleep,
    getSecret,
    workspace,
    // Loop safety counter
    __maxIter: MAX_LOOP_ITERATIONS,
  };

  return { sandbox, getLogs: () => logs };
}

// ---------------------------------------------------------------------------
// Code execution
// ---------------------------------------------------------------------------

/**
 * Wrap user code in an async IIFE so top-level await works.
 */
export function wrapCode(code: string): string {
  return `(async () => {
${code}
})()`;
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

/**
 * Execute JavaScript code in a sandboxed `vm` context.
 *
 * Returns a structured result with success/failure, the return value,
 * captured console logs, and any error information.
 */
export async function runInSandbox(
  options: RunSandboxOptions,
): Promise<RunSandboxResult> {
  const {
    code,
    context,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    globals,
  } = options;

  if (!code.trim()) {
    return { success: false, error: "No code provided", logs: [] };
  }

  const { sandbox, getLogs } = buildSandbox(context);

  // Inject extra globals (e.g. dynamic inputs from Code node)
  if (globals) {
    for (const [key, value] of Object.entries(globals)) {
      sandbox[key] = value;
    }
  }

  try {
    const vmContext = vm.createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false },
    });

    const wrapped = wrapCode(code);
    const script = new vm.Script(wrapped, {
      filename: "agent-js",
    });

    const promise = script.runInContext(vmContext, {
      timeout: timeoutMs,
    });

    let result: unknown;
    if (promise && typeof (promise as Promise<unknown>).then === "function") {
      result = await Promise.race([
        promise as Promise<unknown>,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Async execution timeout")),
            timeoutMs,
          ),
        ),
      ]);
    } else {
      result = promise;
    }

    const logs = getLogs();
    const serialized = serializeResult(result);

    return {
      success: true,
      result: serialized,
      logs: logs.length > 0 ? logs : undefined,
    };
  } catch (e: unknown) {
    const logs = getLogs();
    const errorMessage =
      e instanceof Error ? e.message : String(e);
    const errorStack =
      e instanceof Error ? cleanStack(e.stack ?? "") : undefined;

    return {
      success: false,
      error: errorMessage,
      stack: errorStack,
      logs: logs.length > 0 ? logs : undefined,
    };
  }
}
