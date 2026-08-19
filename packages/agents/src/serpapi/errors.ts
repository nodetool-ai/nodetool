/**
 * One error type for everything the SerpAPI layer can refuse, carrying the
 * distinction a caller acts on.
 *
 * Same shape and the same reason as `apify/errors.ts`: a raw status tells a
 * retry loop nothing (400 from a bad engine parameter and 400 from a malformed
 * query both abort, 429 and 502 both wait), so the client classifies once at
 * the boundary and every layer above reads {@link SerpApiError.retryable}.
 *
 * Nothing here ever carries the API key. The client redacts before
 * constructing, so an error that reaches a model, a tool result, or a log line
 * cannot leak the credential that produced it.
 */

/** What went wrong, in the terms a caller can act on. */
export type SerpApiErrorKind =
  /** No key configured, or the key was rejected. */
  | "auth"
  /** The engine id does not exist in SerpAPI's catalog. */
  | "unknown_engine"
  /** The parameters did not satisfy the engine's own contract. */
  | "invalid_input"
  /** The engine catalog could not be read from serpapi.com. */
  | "catalog_unavailable"
  /** SerpAPI asked us to slow down, or the plan ran out of searches. */
  | "rate_limited"
  /** Transport-level failure before any SerpAPI response. */
  | "network"
  /** The surrounding NodeTool run was cancelled. */
  | "cancelled";

/**
 * Kinds worth trying again. Everything absent is deterministic: retrying a
 * rejected key or a parameter the engine refuses spends the same failure twice.
 */
const RETRYABLE: ReadonlySet<SerpApiErrorKind> = new Set<SerpApiErrorKind>([
  "rate_limited",
  "network"
]);

export interface SerpApiErrorOptions {
  /** HTTP status, when the failure came back as a response. */
  readonly status?: number;
  /** The engine this failed against, when there is one. */
  readonly engine?: string;
  readonly cause?: unknown;
}

/** A failure from the SerpAPI layer, classified. */
export class SerpApiError extends Error {
  readonly kind: SerpApiErrorKind;
  readonly status?: number;
  readonly engine?: string;

  constructor(
    kind: SerpApiErrorKind,
    message: string,
    options: SerpApiErrorOptions = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SerpApiError";
    this.kind = kind;
    if (options.status !== undefined) this.status = options.status;
    if (options.engine !== undefined) this.engine = options.engine;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }

  /** The `{ok: false, …}` envelope every capability answers with. */
  toResult(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      ok: false,
      error: this.message,
      error_kind: this.kind,
      retryable: this.retryable
    };
    if (this.status !== undefined) result.status = this.status;
    if (this.engine !== undefined) result.engine = this.engine;
    return result;
  }
}

/** Wrap an unknown failure so callers always see a classified error. */
export function asSerpApiError(value: unknown): SerpApiError {
  if (value instanceof SerpApiError) return value;
  if (value instanceof Error) {
    const kind: SerpApiErrorKind =
      value.name === "AbortError" ? "cancelled" : "network";
    return new SerpApiError(kind, value.message, { cause: value });
  }
  return new SerpApiError("network", String(value), { cause: value });
}
