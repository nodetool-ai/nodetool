/**
 * Replicate rate-limit retry.
 *
 * An account under $5 of credit is throttled to 6 predictions per minute with
 * a burst of 1, so the second call of a chained run is already a violation.
 *
 * The SDK's own `withAutomaticRetries` cannot wait it out: its `Retry-After`
 * branch only runs for a thrown `ApiError`, while the request helper hands it a
 * plain `Response`, and its delay is `interval * 2 ** (undefined - maxRetries)`
 * — NaN, so `setTimeout` fires immediately. Six back-to-back retries against a
 * burst of 1 all fail, and the node error discards every generation upstream in
 * the run, which was already paid for.
 */

import { createLogger } from "@nodetool-ai/config";
import { isFiniteNumber, isRecord, isString } from "../type-predicates.js";

const log = createLogger("nodetool.runtime.providers.replicate");

/**
 * Wait before attempt 1, 2, and 3. Wider than the ~5s Replicate reports,
 * because a burst of 1 refills slower than the reset it quotes: 20/45/90 is
 * what got chained runs through in practice.
 */
const BACKOFF_MS = [20_000, 45_000, 90_000];

/** Ceiling on a single wait, however long the server asks for. */
const MAX_DELAY_MS = 120_000;

/** The `response` carried by the SDK's `ApiError`, if this is one. */
function responseOf(error: unknown): Record<string, unknown> | null {
  if (!isRecord(error) || !isRecord(error.response)) return null;
  return error.response;
}

function headerOf(error: unknown, name: string): string | null {
  const headers = responseOf(error)?.headers;
  return headers instanceof Headers ? headers.get(name) : null;
}

/** True for a 429 from Replicate, read off the SDK's `ApiError`. */
export function isReplicateRateLimit(error: unknown): boolean {
  return responseOf(error)?.status === 429;
}

function secondsToMs(value: unknown): number | null {
  const seconds = Number(value);
  if (!isFiniteNumber(seconds) || seconds < 0) return null;
  return seconds * 1000;
}

/**
 * How long Replicate asked us to wait, in ms, or null when it did not say.
 * Reads the `Retry-After` header, then `retry_after` in the JSON body — which
 * the SDK has already consumed into the error message by the time we see it.
 */
export function replicateRetryAfterMs(error: unknown): number | null {
  const header = headerOf(error, "retry-after");
  if (header) {
    const fromSeconds = secondsToMs(header);
    if (fromSeconds !== null) return fromSeconds;
    const dateMs = Date.parse(header);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  }
  if (isRecord(error) && isString(error.message)) {
    const match = /"retry_after"\s*:\s*(\d+(?:\.\d+)?)/.exec(error.message);
    if (match) return secondsToMs(match[1]);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a Replicate call, waiting out 429s instead of failing the node.
 *
 * Only a rate limit is retried; every other error propagates untouched. After
 * the schedule is exhausted the original error is thrown, so the caller still
 * sees Replicate's own message.
 */
export async function withReplicateRetry<T>(
  label: string,
  run: () => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= BACKOFF_MS.length || !isReplicateRateLimit(error)) {
        throw error;
      }
      const requested = replicateRetryAfterMs(error) ?? 0;
      const delay = Math.min(
        Math.max(requested, BACKOFF_MS[attempt]),
        MAX_DELAY_MS
      );
      log.warn("rate limited, waiting before retry", {
        label,
        attempt: attempt + 1,
        delayMs: delay,
        retryAfterMs: requested
      });
      await sleep(delay);
    }
  }
}
