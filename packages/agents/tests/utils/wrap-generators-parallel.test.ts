/**
 * Tests for wrapGeneratorsParallel utility.
 */

import { describe, it, expect } from "vitest";
import { wrapGeneratorsParallel } from "../../src/utils/wrap-generators-parallel.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of gen) {
    result.push(item);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("wrapGeneratorsParallel", () => {
  it("yields nothing for an empty input array", async () => {
    const result = await collect(wrapGeneratorsParallel([]));
    expect(result).toEqual([]);
  });

  it("yields all items from a single generator", async () => {
    const gen = fromArray([1, 2, 3]);
    const result = await collect(wrapGeneratorsParallel([gen]));
    expect(result).toEqual([1, 2, 3]);
  });

  it("yields all items from two generators (order: all items present)", async () => {
    const g1 = fromArray(["a", "b"]);
    const g2 = fromArray(["c", "d"]);
    const result = await collect(wrapGeneratorsParallel([g1, g2]));
    // All four items must appear; order may vary due to race.
    expect(result).toHaveLength(4);
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
    expect(result).toContain("d");
  });

  it("handles generators of unequal length", async () => {
    const g1 = fromArray([1]);
    const g2 = fromArray([2, 3, 4]);
    const result = await collect(wrapGeneratorsParallel([g1, g2]));
    expect(result).toHaveLength(4);
    expect(new Set(result)).toEqual(new Set([1, 2, 3, 4]));
  });

  it("handles an empty generator mixed with a non-empty one", async () => {
    const empty = fromArray<number>([]);
    const full = fromArray([10, 20]);
    const result = await collect(wrapGeneratorsParallel([empty, full]));
    expect(result).toEqual([10, 20]);
  });

  it("handles all empty generators", async () => {
    const result = await collect(
      wrapGeneratorsParallel([fromArray<string>([]), fromArray<string>([])])
    );
    expect(result).toEqual([]);
  });

  it("handles three generators", async () => {
    const g1 = fromArray([1, 2]);
    const g2 = fromArray([3, 4]);
    const g3 = fromArray([5, 6]);
    const result = await collect(wrapGeneratorsParallel([g1, g2, g3]));
    expect(result).toHaveLength(6);
    for (let i = 1; i <= 6; i++) {
      expect(result).toContain(i);
    }
  });

  it("works with generators that yield objects", async () => {
    const g1 = fromArray([{ id: 1 }, { id: 2 }]);
    const g2 = fromArray([{ id: 3 }]);
    const result = await collect(wrapGeneratorsParallel([g1, g2]));
    expect(result).toHaveLength(3);
    const ids = result.map((r) => r.id).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3]);
  });

  it("works with generators that yield promises-like timing", async () => {
    async function* delayed(
      values: number[],
      ms: number
    ): AsyncGenerator<number> {
      for (const v of values) {
        await new Promise((r) => setTimeout(r, ms));
        yield v;
      }
    }

    const g1 = delayed([1, 3], 5);
    const g2 = delayed([2, 4], 10);
    const result = await collect(wrapGeneratorsParallel([g1, g2]));
    // All values are present; due to timing, order is [1, 2, 3, 4] or [1, 3, 2, 4].
    expect(result).toHaveLength(4);
    expect(new Set(result)).toEqual(new Set([1, 2, 3, 4]));
  });
});
