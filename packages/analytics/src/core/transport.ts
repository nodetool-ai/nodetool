import type { AnalyticsBatch } from "../schema/envelope.js";

/**
 * Sends one batch. Resolves `true` when the batch is done with: accepted, or
 * permanently rejected so that resending it cannot help. Resolves `false`
 * when a later attempt may succeed (offline, timeout, 5xx, 429).
 */
export interface AnalyticsTransport {
  send(batch: AnalyticsBatch): Promise<boolean>;
}

export interface FetchTransportOptions {
  url: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** Let a browser finish the request after the page unloads. */
  keepalive?: boolean;
}

/**
 * POST a batch as JSON. Sends no cookies, no referrer and no custom headers,
 * so the receiver gets the body and nothing that identifies the sender beyond
 * the network connection itself. Never throws.
 */
export function createFetchTransport(
  options: FetchTransportOptions
): AnalyticsTransport {
  const timeoutMs = options.timeoutMs ?? 5_000;
  return {
    async send(batch) {
      const doFetch = options.fetch ?? globalThis.fetch;
      if (typeof doFetch !== "function") return false;
      try {
        const response = await doFetch(options.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch),
          credentials: "omit",
          referrerPolicy: "no-referrer",
          cache: "no-store",
          keepalive: options.keepalive === true,
          signal: timeoutSignal(timeoutMs)
        });
        return response.ok || isPermanentRejection(response.status);
      } catch {
        // Offline, blocked or timed out: keep the batch for a later attempt.
        return false;
      }
    }
  };
}

/** Older runtimes lack `AbortSignal.timeout`; send without a deadline there. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

/** A 4xx other than 408 and 429 means the receiver will never take this batch. */
function isPermanentRejection(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** A transport that sends nothing. Used when no endpoint is configured. */
export const NULL_TRANSPORT: AnalyticsTransport = {
  send: async () => false
};
