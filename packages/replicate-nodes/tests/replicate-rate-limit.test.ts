/**
 * A chained run on an account under $5 of credit: Replicate allows a burst of
 * 1, so the second node's prediction is throttled. The node must wait it out —
 * failing here discards the first node's generation, which was already paid for.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockRun = vi.fn();

vi.mock("replicate", () => ({
  default: class {
    run = mockRun;
  }
}));

import { replicateSubmit } from "../src/replicate-base.js";

function throttled(): Error {
  const body =
    '{"detail":"Request was throttled. Your rate limit for creating predictions is reduced to 6 requests per minute with a burst of 1 requests while you have less than $5.0 in credit. Your rate limit resets in ~5s.","status":429,"retry_after":5}';
  const error = new Error(
    `Request to https://api.replicate.com/v1/predictions failed with status 429 Too Many Requests: ${body}.`
  );
  return Object.assign(error, {
    response: { status: 429, headers: new Headers({ "retry-after": "5" }) }
  });
}

beforeEach(() => {
  mockRun.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("replicateSubmit under the low-credit throttle", () => {
  it("waits out a 429 and returns the prediction", async () => {
    mockRun
      .mockRejectedValueOnce(throttled())
      .mockResolvedValue("https://replicate.delivery/relit.png");

    const result = replicateSubmit("r8_chain", "model/relight", {
      image: "https://replicate.delivery/cutout.png"
    });
    await vi.advanceTimersByTimeAsync(120_000);

    await expect(result).resolves.toEqual({
      output: "https://replicate.delivery/relit.png"
    });
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it("surfaces a non-throttle failure straight away", async () => {
    mockRun.mockRejectedValue(new Error("Invalid version"));

    await expect(
      replicateSubmit("r8_bad_version", "model/relight", {})
    ).rejects.toThrow("Invalid version");
    expect(mockRun).toHaveBeenCalledTimes(1);
  });
});
