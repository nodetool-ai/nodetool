/**
 * CI runs this suite as `--shard=N/M` legs. A file the sequencer assigns to no
 * shard is never run and the gate stays green, so the partition is pinned on
 * the real list of test files.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import type { TestSpecification, Vitest } from "vitest/node";

import { BASE_SECONDS, WeightedShardSequencer, assignShards } from "./_helpers/weighted-shards.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function testFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      return testFiles(path);
    }
    return entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const FILES = testFiles("tests");

describe("assignShards", () => {
  it("puts every test file in exactly one shard", () => {
    expect(FILES.length).toBeGreaterThan(100);
    for (const count of [1, 2, 3, 4, 7]) {
      const shards = assignShards(FILES, count);
      expect(shards).toHaveLength(count);
      expect(shards.flat().sort()).toEqual([...FILES].sort());
    }
  });

  it("assigns the same shards for the same files in any order", () => {
    expect(assignShards([...FILES].reverse(), 3)).toEqual(assignShards(FILES, 3));
  });

  it("balances the shards by duration, not by file count", () => {
    const seconds: Record<string, number> = { "long.test.ts": 100, "medium.test.ts": 40 };
    const quick = Array.from({ length: 30 }, (_, i) => `quick-${String(i).padStart(2, "0")}.test.ts`);
    const shards = assignShards([...quick, ...Object.keys(seconds)], 2, seconds);
    const total = (paths: string[]): number =>
      paths.reduce((sum, path) => sum + (seconds[path] ?? 0) + BASE_SECONDS, 0);
    expect(shards[0]).toEqual(["long.test.ts"]);
    expect(shards[1]).toHaveLength(31);
    expect(total(shards[0])).toBe(total(shards[1]));
  });

  it("keeps the recorded durations of three shards within a tenth of each other", () => {
    const seconds = JSON.parse(readFileSync(join(ROOT, "tests/shard-seconds.json"), "utf8")) as Record<string, number>;
    expect(Object.keys(seconds).length).toBeGreaterThan(0);
    const totals = assignShards(FILES, 3).map((paths) =>
      paths.reduce((sum, path) => sum + (seconds[path] ?? 0) + BASE_SECONDS, 0)
    );
    expect(Math.min(...totals) / Math.max(...totals)).toBeGreaterThan(0.9);
  });

  it("rejects a shard count that would drop files", () => {
    expect(() => assignShards(FILES, 0)).toThrow("positive integer");
    expect(() => assignShards(FILES, 1.5)).toThrow("positive integer");
  });
});

describe("WeightedShardSequencer", () => {
  const specs = FILES.map((path) => ({ moduleId: join(ROOT, path) }) as TestSpecification);
  const shard = (index: number, count: number): Promise<TestSpecification[]> => {
    const ctx = { config: { root: ROOT, shard: { index, count } } } as unknown as Vitest;
    return new WeightedShardSequencer(ctx).shard(specs);
  };

  it("returns disjoint shards that cover every file", async () => {
    const shards = await Promise.all([1, 2, 3].map((index) => shard(index, 3)));
    const ids = shards.flat().map((spec) => spec.moduleId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(specs.map((spec) => spec.moduleId).sort());
    for (const part of shards) {
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it("matches assignShards for each index", async () => {
    const expected = assignShards(FILES, 3);
    for (const index of [1, 2, 3]) {
      const got = (await shard(index, 3)).map((spec) => spec.moduleId);
      expect(got.sort()).toEqual(expected[index - 1].map((path) => join(ROOT, path)).sort());
    }
  });
});
