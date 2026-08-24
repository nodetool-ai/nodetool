import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isReplicateRateLimit,
  replicateRetryAfterMs,
  withReplicateRetry
} from "../../src/providers/replicate-retry.js";

/**
 * The 429 an account under $5 of credit gets, in the shape the Replicate SDK
 * throws it: `ApiError` carries the `Response`, and the body has already been
 * read into the message.
 */
function rateLimitError(
  body = '{"detail":"Request was throttled. Your rate limit for creating predictions is reduced to 6 requests per minute with a burst of 1 requests while you have less than $5.0 in credit. Your rate limit resets in ~5s.","status":429,"retry_after":5}',
  headers: Record<string, string> = {}
): Error {
  const error = new Error(
    `Request to https://api.replicate.com/v1/predictions failed with status 429 Too Many Requests: ${body}.`
  );
  return Object.assign(error, {
    response: { status: 429, headers: new Headers(headers) }
  });
}

function serverError(): Error {
  const error = new Error(
    "Request to https://api.replicate.com/v1/predictions failed with status 422 Unprocessable Entity: {}."
  );
  return Object.assign(error, {
    response: { status: 422, headers: new Headers() }
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isReplicateRateLimit", () => {
  it("recognizes the 429 response", () => {
    expect(isReplicateRateLimit(rateLimitError())).toBe(true);
  });

  it("rejects other failures", () => {
    expect(isReplicateRateLimit(serverError())).toBe(false);
    expect(isReplicateRateLimit(new Error("socket hang up"))).toBe(false);
    expect(isReplicateRateLimit(null)).toBe(false);
  });
});

describe("replicateRetryAfterMs", () => {
  it("reads retry_after out of the body", () => {
    expect(replicateRetryAfterMs(rateLimitError())).toBe(5000);
  });

  it("prefers the Retry-After header", () => {
    expect(
      replicateRetryAfterMs(rateLimitError(undefined, { "retry-after": "12" }))
    ).toBe(12_000);
  });

  it("parses an HTTP-date Retry-After", () => {
    const when = new Date(Date.now() + 30_000).toUTCString();
    const ms = replicateRetryAfterMs(
      rateLimitError('{"status":429}', { "retry-after": when })
    );
    expect(ms).toBeGreaterThan(28_000);
    expect(ms).toBeLessThanOrEqual(30_000);
  });

  it("returns null when the server said nothing", () => {
    expect(replicateRetryAfterMs(serverError())).toBeNull();
    expect(replicateRetryAfterMs(rateLimitError("{}"))).toBeNull();
  });
});

describe("withReplicateRetry", () => {
  it("returns the output without waiting when the call succeeds", async () => {
    const run = vi.fn().mockResolvedValue("ok");
    await expect(withReplicateRetry("m", run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("waits out the throttle instead of failing the node", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValue("relit.png");

    const result = withReplicateRetry("relight", run);
    await vi.advanceTimersByTimeAsync(120_000);

    await expect(result).resolves.toBe("relit.png");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("waits wider than the ~5s the server quotes", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValue("ok");

    const result = withReplicateRetry("relight", run);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("waits longer when the server asks for longer", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError(undefined, { "retry-after": "60" }))
      .mockResolvedValue("ok");

    const result = withReplicateRetry("relight", run);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBe("ok");
  });

  it("caps a single wait at two minutes", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(
        rateLimitError(undefined, { "retry-after": "3600" })
      )
      .mockResolvedValue("ok");

    const result = withReplicateRetry("relight", run);
    await vi.advanceTimersByTimeAsync(120_000);
    await expect(result).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not retry anything but a rate limit", async () => {
    const run = vi.fn().mockRejectedValue(serverError());
    await expect(withReplicateRetry("m", run)).rejects.toThrow("status 422");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("gives up after three waits and rethrows Replicate's error", async () => {
    const run = vi.fn().mockRejectedValue(rateLimitError());

    const result = withReplicateRetry("relight", run);
    const assertion = expect(result).rejects.toThrow("status 429");
    await vi.advanceTimersByTimeAsync(20_000 + 45_000 + 90_000);
    await assertion;

    expect(run).toHaveBeenCalledTimes(4);
  });
});
