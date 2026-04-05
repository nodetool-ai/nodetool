/**
 * Shared sandboxed JavaScript execution engine.
 *
 * Used by both the MiniJSAgentTool (agent tool) and the CodeNode (workflow node).
 * Runs user code in an isolated `vm` context with curated APIs and safety limits.
 */

import * as vm from "node:vm";
import * as _ from "lodash-es";
import dayjs from "dayjs";
import * as cheerio from "cheerio";
import { parse as csvParse } from "csv-parse/sync";
import validator from "validator";
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
        (!line.includes("node:") && !line.includes("node_modules"))
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
    }
  };

  // Sandboxed fetch with limits
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
        json
      };
    } finally {
      clearTimeout(timer);
    }
  };

  // uuid helper — not available natively without crypto.randomUUID
  const uuid = () => crypto.randomUUID();

  // Secret accessor (requires context)
  const getSecret = context
    ? async (name: string): Promise<string | undefined> => {
        return (await context.getSecret(name)) ?? undefined;
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
    // Async
    setTimeout: undefined, // blocked
    setInterval: undefined, // blocked
    // Non-native APIs
    _,
    dayjs,
    cheerio,
    csvParse,
    validator,
    fetch: sandboxedFetch,
    uuid,
    sleep,
    getSecret,
    workspace,
    // Loop safety counter
    __maxIter: MAX_LOOP_ITERATIONS
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
  options: RunSandboxOptions
): Promise<RunSandboxResult> {
  const { code, context, timeoutMs = DEFAULT_TIMEOUT_MS, globals } = options;

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
      codeGeneration: { strings: false, wasm: false }
    });

    const wrapped = wrapCode(code);
    const script = new vm.Script(wrapped, {
      filename: "agent-js"
    });

    const promise = script.runInContext(vmContext, {
      timeout: timeoutMs
    });

    let result: unknown;
    if (promise && typeof (promise as Promise<unknown>).then === "function") {
      let timerId: ReturnType<typeof setTimeout> | undefined;
      try {
        result = await Promise.race([
          promise as Promise<unknown>,
          new Promise((_, reject) => {
            timerId = setTimeout(
              () => reject(new Error("Async execution timeout")),
              timeoutMs
            );
          })
        ]);
      } finally {
        if (timerId !== undefined) clearTimeout(timerId);
      }
    } else {
      result = promise;
    }

    const logs = getLogs();
    const serialized = serializeResult(result);

    return {
      success: true,
      result: serialized,
      logs: logs.length > 0 ? logs : undefined
    };
  } catch (e: unknown) {
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
