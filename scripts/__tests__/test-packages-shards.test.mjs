/**
 * The `test-packages-*` shards in quality-checks.yml each run `turbo run test`
 * over a slice of the workspace, and the slices are hand-written: `nodes` is a
 * positive list, `core` is the same list negated. A package that lands in two
 * shards runs twice; one that lands in none is never tested and the gate stays
 * green. Neither mistake shows in a CI run, so the partition is pinned here
 * against turbo's own resolution of the filters.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = resolve(ROOT, ".github/workflows/quality-checks.yml");

/** The full backend suite, as `npm run test:packages` selects it. */
const FULL_SUITE = ["--filter=./packages/*", "--filter=./reliability/*"];

/**
 * Every `- check: test-packages-<name>` entry with the `--filter=` arguments
 * of its `command:` line. Regex over the file rather than a YAML parse: the
 * root workspace has no YAML dependency of its own, and the two lines are
 * adjacent by convention.
 */
export function readShardFilters(workflowSource) {
  const shards = new Map();
  const entry =
    /- check: (test-packages-[\w-]+)\n\s+command: (.+)/g;
  for (const [, name, command] of workflowSource.matchAll(entry)) {
    const filters = [...command.matchAll(/--filter=('[^']*'|\S+)/g)].map(
      ([, value]) => `--filter=${value.replace(/^'|'$/g, "")}`
    );
    shards.set(name, filters);
  }
  return shards;
}

/** Packages turbo would run `test` in for these filters. */
function packagesInScope(filters) {
  const json = execFileSync(
    "npx",
    ["turbo", "run", "test", "--dry-run=json", ...filters],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      // The full-suite dry run describes every task's hash and inputs, a few
      // megabytes past execFileSync's 1 MiB default.
      maxBuffer: 64 * 1024 * 1024
    }
  );
  const { tasks } = JSON.parse(json);
  return new Set(
    tasks.filter((t) => t.task === "test").map((t) => t.package)
  );
}

describe("test-packages shards", () => {
  const shards = readShardFilters(readFileSync(WORKFLOW, "utf8"));

  it("finds the shards and a filter for each", () => {
    expect(shards.size).toBeGreaterThanOrEqual(2);
    for (const [name, filters] of shards) {
      expect(filters.length, name).toBeGreaterThan(0);
    }
  });

  it("partitions the full suite: every package in exactly one shard", () => {
    const full = packagesInScope(FULL_SUITE);
    expect(full.size).toBeGreaterThan(0);

    const seen = new Map();
    for (const [name, filters] of shards) {
      for (const pkg of packagesInScope(filters)) {
        seen.set(pkg, [...(seen.get(pkg) ?? []), name]);
      }
    }

    const twice = [...seen].filter(([, names]) => names.length > 1);
    expect(twice, "packages tested by more than one shard").toEqual([]);

    const missing = [...full].filter((pkg) => !seen.has(pkg));
    expect(missing, "packages no shard tests").toEqual([]);

    const extra = [...seen.keys()].filter((pkg) => !full.has(pkg));
    expect(extra, "packages outside the suite").toEqual([]);
  }, 120_000);
});
