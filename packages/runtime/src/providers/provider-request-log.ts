/**
 * Central failure logging for provider calls.
 *
 * When an LLM provider call fails (e.g. a 422 Unprocessable Entity), we want a
 * precise record of what was sent — the actual wire payload, not just the
 * opaque error. {@link logProviderRequestFailure} is invoked from
 * `BaseProvider`'s traced wrappers so every provider gets identical, redacted,
 * size-bounded failure logging from one place.
 *
 * Providers feed their exact request body via `recordRequestPayload` (see
 * `BaseProvider`); when a provider hasn't been instrumented, the wrapper falls
 * back to logging the NodeTool-level request args.
 */

import { createLogger, type Logger } from "@nodetool-ai/config";

const log = createLogger("nodetool.runtime.provider.request");

interface SanitizeOptions {
  /** Strings longer than this are truncated (default 1000). */
  maxStringLength?: number;
  /** Arrays longer than this are truncated (default 200). */
  maxArrayLength?: number;
  /** Recursion is cut off at this depth (default 12). */
  maxDepth?: number;
}

const SANITIZE_DEFAULTS: Required<SanitizeOptions> = {
  maxStringLength: 1000,
  maxArrayLength: 200,
  maxDepth: 12
};

/**
 * A key holds a secret when its normalized form (lowercased, separators
 * stripped) contains a secret marker or exactly names a credential field.
 * Deliberately conservative so diagnostic fields like `max_tokens` (→
 * "maxtokens") are never mistaken for the credential field `token`.
 */
function isSecretKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[-_\s]/g, "");
  if (
    k.includes("apikey") ||
    k.includes("secret") ||
    k.includes("password") ||
    k.includes("passwd") ||
    k.includes("authorization")
  ) {
    return true;
  }
  return SECRET_EXACT.has(k);
}

const SECRET_EXACT = new Set([
  "token",
  "auth",
  "bearer",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "idtoken",
  "privatekey",
  "credentials"
]);

function truncateString(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… [truncated ${s.length} chars total]`;
}

/**
 * Deep-clone `value` into a JSON-safe, log-friendly shape: long strings and
 * arrays are truncated, binary buffers become size markers, secret-bearing
 * keys are redacted, and circular references are broken. Never throws.
 */
export function sanitizeForLog(
  value: unknown,
  opts: SanitizeOptions = {}
): unknown {
  const o = { ...SANITIZE_DEFAULTS, ...opts };
  // Tracks the current DFS path (not all visited nodes) so shared-but-acyclic
  // references aren't falsely flagged as circular.
  const ancestors = new WeakSet<object>();

  function walk(v: unknown, depth: number): unknown {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === "string") return truncateString(v as string, o.maxStringLength);
    if (t === "number" || t === "boolean") return v;
    if (t === "bigint") return `${(v as bigint).toString()}n`;
    if (t === "function") {
      return `[function ${(v as { name?: string }).name || "anonymous"}]`;
    }
    if (t === "symbol") return (v as symbol).toString();
    if (v instanceof ArrayBuffer) return `[binary ${v.byteLength} bytes]`;
    if (ArrayBuffer.isView(v)) {
      return `[binary ${(v as ArrayBufferView).byteLength} bytes]`;
    }
    if (t === "object") {
      const obj = v as object;
      if (ancestors.has(obj)) return "[circular]";
      if (depth >= o.maxDepth) return "[max depth exceeded]";
      ancestors.add(obj);
      try {
        if (Array.isArray(v)) {
          const out = v
            .slice(0, o.maxArrayLength)
            .map((item) => walk(item, depth + 1));
          if (v.length > o.maxArrayLength) {
            out.push(`[${v.length - o.maxArrayLength} more items truncated]`);
          }
          return out;
        }
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          out[k] = isSecretKey(k) ? "[redacted]" : walk(val, depth + 1);
        }
        return out;
      } finally {
        ancestors.delete(obj);
      }
    }
    return String(v);
  }

  return walk(value, 0);
}

export interface ProviderFailureLog {
  provider: string;
  model: string;
  /** The exact wire payload the provider sent, if it was recorded. */
  request?: unknown;
  /** NodeTool-level request args, logged when no wire payload was recorded. */
  nodetoolArgs?: unknown;
  error: unknown;
}

/** Caller cancellations (AbortSignal) are not provider failures — skip them. */
function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  if (typeof name === "string" && /abort/i.test(name)) return true;
  const code = (error as { code?: unknown }).code;
  return code === 20 || code === "ABORT_ERR";
}

function httpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { status?: unknown; statusCode?: unknown };
  if (typeof e.status === "number") return e.status;
  if (typeof e.statusCode === "number") return e.statusCode;
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Log precisely what was sent to a provider when its call fails. Prefers the
 * recorded wire payload; falls back to the NodeTool-level args. Aborted
 * requests are skipped. The `logger` arg is for testing — production calls use
 * the module logger.
 */
export function logProviderRequestFailure(
  params: ProviderFailureLog,
  logger: Logger = log
): void {
  if (isAbortError(params.error)) return;

  const hasWire = params.request !== undefined && params.request !== null;
  const entry: Record<string, unknown> = {
    provider: params.provider,
    model: params.model,
    requestSource: hasWire ? "wire" : "nodetool-args",
    error: errorMessage(params.error),
    request: sanitizeForLog(hasWire ? params.request : params.nodetoolArgs)
  };
  const status = httpStatus(params.error);
  if (status !== undefined) entry.status = status;

  logger.error("Provider request failed", entry);
}
