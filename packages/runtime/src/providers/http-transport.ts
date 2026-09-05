/**
 * The transport rules every job-based media provider shares: which statuses are
 * worth another attempt, which requests may be attempted again at all, how long
 * to wait, and when a poll has reached a terminal state.
 *
 * Each vendor used to carry two copies of this — one in its node package, one in
 * its runtime provider — and the copies disagreed on rules that cost money. The
 * runtime `TopazProvider` retried the job-creating POST, so a 429 the server had
 * already billed produced a second billable job; the node copy gated the same
 * loop to idempotent methods. This module is the one place those rules live.
 *
 * See `packages/AGENTS.md` § External-API Wrapper Nodes for the rules themselves.
 */

/** Statuses that mean "the request may work if attempted again". */
export const RETRYABLE_STATUS: ReadonlySet<number> = new Set([
  429, 500, 502, 503, 504
]);

/**
 * The methods that may be attempted more than once. A job-creating POST or a
 * state-transitioning PATCH may have taken effect — and been billed — before the
 * error came back, so those get a single attempt. Presigned uploads are PUTs and
 * are safe to repeat.
 */
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "PUT"]);

/** Ceiling for a single backoff wait, including one a `Retry-After` asks for. */
export const MAX_BACKOFF_MS = 30000;

/** Sleep, resolving early (without rejecting) when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Resolve a `Retry-After` header to a bounded millisecond wait.
 *
 * RFC 7231 allows either delay-seconds or an HTTP-date. `Number()` on a date is
 * `NaN` and `setTimeout(_, NaN)` fires immediately, which removes the backoff
 * during exactly the overload the header is announcing — so both forms are
 * parsed, the result is clamped to `>= 0`, capped, and an unparseable value
 * falls back to the caller's exponential delay.
 */
export function retryAfterMs(
  header: string | null | undefined,
  fallbackMs: number,
  capMs: number = MAX_BACKOFF_MS
): number {
  if (!header || !header.trim()) return fallbackMs;
  const bound = (ms: number): number => Math.min(capMs, Math.max(0, ms));
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return bound(seconds * 1000);
  const when = Date.parse(header);
  if (Number.isFinite(when)) return bound(when - Date.now());
  return fallbackMs;
}

export interface FetchWithRetryOptions {
  maxAttempts?: number;
  /**
   * Retry only GET/HEAD/PUT (the default). Set false only for a POST the vendor
   * documents as idempotent.
   */
  idempotentOnly?: boolean;
  /** Injected fetch, for tests and for providers that wrap their own. */
  fetchImpl?: typeof fetch;
}

/**
 * Fetch, retrying retryable statuses and thrown network errors with exponential
 * backoff. A non-idempotent request is attempted once. The discarded body of a
 * retried response is drained so the keep-alive connection stays reusable.
 *
 * Returns the last response even when it is still retryable — the caller reads
 * `res.ok` and reports the status, as it would without retries.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const { maxAttempts = 6, idempotentOnly = true, fetchImpl } = options;
  const doFetch = fetchImpl ?? fetch;
  const method = (init.method ?? "GET").toUpperCase();
  const attempts = !idempotentOnly || IDEMPOTENT_METHODS.has(method)
    ? maxAttempts
    : 1;

  let delay = 1000;
  let last: Response | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let resp: Response;
    try {
      resp = await doFetch(url, init);
    } catch (err) {
      if (attempt === attempts) throw err;
      await sleep(delay, init.signal ?? undefined);
      delay = Math.min(delay * 2, MAX_BACKOFF_MS);
      continue;
    }
    if (!RETRYABLE_STATUS.has(resp.status)) return resp;
    last = resp;
    if (attempt === attempts) break;
    const wait = retryAfterMs(resp.headers?.get("Retry-After"), delay);
    await Promise.resolve(resp.arrayBuffer?.()).catch(() => undefined);
    await sleep(wait, init.signal ?? undefined);
    delay = Math.min(delay * 2, MAX_BACKOFF_MS);
  }
  return last as Response;
}

/**
 * Terminal states, as the union of every synonym these vendors have been
 * observed to emit. A terminal status a poll loop does not recognize degrades
 * into a timeout, which reports a finished job as a slow one.
 */
export const TERMINAL_SUCCESS_STATES: ReadonlySet<string> = new Set([
  "completed",
  "complete",
  "succeeded",
  "success",
  "done"
]);

export const TERMINAL_FAILURE_STATES: ReadonlySet<string> = new Set([
  "failed",
  "fail",
  "error",
  "cancelled",
  "canceled"
]);

export interface PollUntilTerminalOptions<T> {
  success?: ReadonlySet<string>;
  failure?: ReadonlySet<string>;
  intervalMs: number;
  maxAttempts: number;
  /** Reads the status word out of a poll body; defaults to `body.status`. */
  statusOf?: (body: T) => string;
  /** The error a terminal failure status raises. */
  onFailure?: (body: T) => Error;
  /** The error an exhausted attempt budget raises. */
  onTimeout?: () => Error;
  signal?: AbortSignal;
}

function defaultStatusOf(body: unknown): string {
  const status = (body as { status?: unknown } | null)?.status;
  return String(status ?? "").toLowerCase();
}

/**
 * Call `fetchStatus` until it reports a terminal state, and return the body that
 * reported success. Does not sleep after the final attempt.
 */
export async function pollUntilTerminal<T>(
  fetchStatus: (attempt: number) => Promise<T>,
  options: PollUntilTerminalOptions<T>
): Promise<T> {
  const {
    success = TERMINAL_SUCCESS_STATES,
    failure = TERMINAL_FAILURE_STATES,
    intervalMs,
    maxAttempts,
    statusOf = defaultStatusOf,
    onFailure,
    onTimeout,
    signal
  } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const body = await fetchStatus(attempt);
    const status = statusOf(body);
    if (success.has(status)) return body;
    if (failure.has(status)) {
      throw (
        onFailure?.(body) ??
        new Error(`Job failed: ${JSON.stringify(body).slice(0, 500)}`)
      );
    }
    if (attempt < maxAttempts - 1) await sleep(intervalMs, signal);
  }
  throw (
    onTimeout?.() ??
    new Error(`Job did not complete within ${maxAttempts} poll attempts`)
  );
}
