/**
 * The fan-out helper the script, storyboard and thread capabilities share:
 * results in input order, never more than `limit` tasks in flight, and a
 * clamp that turns anything a model supplies into a bound within the cap.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  clampConcurrency,
  mapWithConcurrency
} from "../src/capabilities/concurrency.js";

describe("clampConcurrency", () => {
  it("falls back to the default for anything that is not a positive number", () => {
    for (const value of [undefined, null, "", "abc", NaN, 0, -3, {}]) {
      expect(clampConcurrency(value)).toBe(DEFAULT_CONCURRENCY);
    }
  });

  it("floors a fractional value and caps at the maximum", () => {
    expect(clampConcurrency(2.9)).toBe(2);
    expect(clampConcurrency("4")).toBe(4);
    expect(clampConcurrency(MAX_CONCURRENCY + 100)).toBe(MAX_CONCURRENCY);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps input order and holds no more than `limit` in flight", async () => {
    const items = [0, 1, 2, 3, 4, 5, 6];
    let running = 0;
    let peak = 0;

    const results = await mapWithConcurrency(items, 3, async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return item * 2;
    });

    expect(results).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(3);
  });

  it("returns an empty array without running the task", async () => {
    let calls = 0;
    const results = await mapWithConcurrency([], 3, async () => {
      calls += 1;
      return 1;
    });
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it("rejects when a task rejects", async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (item) => {
        if (item === 2) throw new Error("boom");
        return item;
      })
    ).rejects.toThrow("boom");
  });
});
