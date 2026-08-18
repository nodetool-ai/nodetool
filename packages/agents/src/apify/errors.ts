/**
 * One error type for everything Apify can refuse, carrying the distinction a
 * caller acts on.
 *
 * The `kind` is the whole point. A raw HTTP status tells a retry loop nothing
 * useful — 400 from a bad actor input and 400 from a malformed run id both
 * abort, while 429 and 502 both wait — so the client classifies once, at the
 * boundary, and every layer above reads {@link ApifyError.retryable} instead of
 * re-deriving it from a status code it would have to keep in sync.
 *
 * Nothing here ever carries the API token. The client redacts before
 * constructing, so an error that reaches a model, a tool result, or a log line
 * cannot leak the credential that produced it.
 */

/** What went wrong, in the terms a caller can act on. */
export type ApifyErrorKind =
  /** No token configured, or the token was rejected. */
  | "auth"
  /** The Apify capability is switched off for this install. */
  | "disabled"
  /** The actor id does not resolve. */
  | "actor_not_found"
  /** The actor resolves but this install's policy will not run it. */
  | "actor_not_allowed"
  /** The input did not satisfy the actor's own schema. */
  | "invalid_input"
  /** The run reached a terminal failure state. */
  | "run_failed"
  /** The run outlived its deadline. */
  | "run_timed_out"
  /** The run was aborted — by us on cancellation, or on Apify's side. */
  | "run_aborted"
  /** Reading a dataset or key-value record failed. */
  | "dataset_failed"
  /** Importing an actor-produced file into NodeTool storage failed. */
  | "asset_download_failed"
  /** Apify asked us to slow down. */
  | "rate_limited"
  /** A NodeTool-side cap (runs, items, cost) would be exceeded. */
  | "budget_exceeded"
  /** Transport-level failure before any Apify response. */
  | "network"
  /** The surrounding NodeTool run was cancelled. */
  | "cancelled";

/**
 * Kinds worth trying again. Everything absent is deterministic: retrying a
 * rejected token or an input the actor's schema refuses just spends the same
 * failure twice, and retrying a *run* failure can spend real money twice.
 */
const RETRYABLE: ReadonlySet<ApifyErrorKind> = new Set<ApifyErrorKind>([
  "rate_limited",
  "network"
]);

export interface ApifyErrorOptions {
  /** HTTP status, when the failure came back as a response. */
  readonly status?: number;
  /** Apify's own error type string, e.g. "actor-not-found". */
  readonly apifyType?: string;
  /** Seconds Apify asked us to wait, from `Retry-After`. */
  readonly retryAfterSeconds?: number;
  /** The run this failed against, when there is one. */
  readonly runId?: string;
  /** The actor this failed against, when there is one. */
  readonly actorId?: string;
  readonly cause?: unknown;
}

/** A failure from the Apify layer, classified. */
export class ApifyError extends Error {
  readonly kind: ApifyErrorKind;
  readonly status?: number;
  readonly apifyType?: string;
  readonly retryAfterSeconds?: number;
  readonly runId?: string;
  readonly actorId?: string;

  constructor(
    kind: ApifyErrorKind,
    message: string,
    options: ApifyErrorOptions = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "ApifyError";
    this.kind = kind;
    if (options.status !== undefined) this.status = options.status;
    if (options.apifyType !== undefined) this.apifyType = options.apifyType;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
    if (options.runId !== undefined) this.runId = options.runId;
    if (options.actorId !== undefined) this.actorId = options.actorId;
  }

  /** Whether trying the same call again could plausibly succeed. */
  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }

  /**
   * The shape a capability returns to a model or to guest code: the
   * distinction, the sentence, and the ids needed to follow up — never a raw
   * HTTP body, which is where a token echoed back in a request dump would sit.
   */
  toResult(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      ok: false,
      error: this.message,
      error_kind: this.kind
    };
    if (this.status !== undefined) result.status = this.status;
    if (this.actorId !== undefined) result.actor_id = this.actorId;
    if (this.runId !== undefined) result.run_id = this.runId;
    return result;
  }
}

/** True when `value` is an {@link ApifyError} of any kind. */
export function isApifyError(value: unknown): value is ApifyError {
  return value instanceof ApifyError;
}

/**
 * Wrap anything thrown below us as an {@link ApifyError}, preserving one that
 * already is. `AbortError` becomes `cancelled` rather than `network`: a
 * cancelled run is a decision, not a fault, and the retry logic must not treat
 * it as a transient blip worth repeating.
 */
export function asApifyError(
  value: unknown,
  fallback: ApifyErrorKind = "network"
): ApifyError {
  if (isApifyError(value)) return value;
  const message = value instanceof Error ? value.message : String(value);
  const aborted =
    value instanceof Error &&
    (value.name === "AbortError" || value.name === "TimeoutError");
  return new ApifyError(
    aborted ? "cancelled" : fallback,
    aborted ? "The Apify call was cancelled" : message,
    { cause: value }
  );
}
