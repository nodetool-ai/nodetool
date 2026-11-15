/**
 * `--shard` for this suite, balanced by measured duration.
 *
 * Vitest's own sharding sorts the test files by a hash of their path and cuts
 * the list into equal counts. The suite's three longest files sit next to
 * each other in that order, so with two shards one ran for 18 minutes and the
 * other for 8. This sequencer assigns files to shards by the seconds recorded
 * in `tests/shard-seconds.json`, longest first, each to the shard with the
 * least time so far.
 *
 * The seconds only decide the balance. Every file is assigned to exactly one
 * shard whether or not it has an entry, so a new, renamed or removed test
 * needs no change here. Refresh the entries from the per-file durations in a
 * CI log when one shard runs much longer than the others.
 */
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";

import { BaseSequencer, type TestSpecification } from "vitest/node";

/** Seconds charged to every file for import and setup, and to unlisted files in total. */
export const BASE_SECONDS = 2;

const SECONDS: Readonly<Record<string, number>> = JSON.parse(
  readFileSync(new URL("../shard-seconds.json", import.meta.url), "utf8")
) as Record<string, number>;

/**
 * Split `paths` into `count` lists. Deterministic for a set of paths in any
 * order: the longest file goes first, ties go by path, and each file joins
 * the list with the least time, the earliest such list on a tie.
 */
export function assignShards(
  paths: readonly string[],
  count: number,
  seconds: Readonly<Record<string, number>> = SECONDS
): string[][] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Shard count must be a positive integer, got ${count}.`);
  }
  const cost = (path: string): number => (seconds[path] ?? 0) + BASE_SECONDS;
  const ordered = [...new Set(paths)].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : 1));
  const shards = Array.from({ length: count }, () => ({ paths: [] as string[], total: 0 }));
  for (const path of ordered) {
    let target = shards[0];
    for (const shard of shards) {
      if (shard.total < target.total) {
        target = shard;
      }
    }
    target.paths.push(path);
    target.total += cost(path);
  }
  return shards.map((shard) => shard.paths);
}

export class WeightedShardSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { root, shard } = this.ctx.config;
    if (!shard) {
      return files;
    }
    const key = (spec: TestSpecification): string => relative(root, spec.moduleId).split(sep).join("/");
    const mine = new Set(assignShards(files.map(key), shard.count)[shard.index - 1]);
    return files.filter((spec) => mine.has(key(spec)));
  }
}
