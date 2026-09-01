/**
 * `Agent` stays retired.
 *
 * D1 ([ADR 0002](../../../docs/adr/0002-codeact-is-the-one-agent-loop.md))
 * deleted the second agent loop and everything only it wired: the compiler
 * pass, the plan cache, the checkpoint store, and the plan-approval callback.
 * Deleting code proves nothing about tomorrow — a re-added `new Agent(` would
 * compile, pass every other suite, and split the fixes A1/A2/A4/A7 land into
 * two places again. This is the check that fails when it comes back.
 *
 * It reads the sources rather than the module graph on purpose: a symbol
 * reintroduced under a new name, in a file nothing imports yet, is exactly the
 * shape a type check misses.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packagesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The symbols the retired loop owned, as they appear in source. */
const RETIRED = ["new Agent(", "CompilerAgent", "CheckpointStore", "PlanCache"];

/**
 * Files whose own text names a retired symbol for a legitimate reason. This
 * test is one of them: it has to spell them to look for them.
 */
const ALLOWED: Record<string, string> = {
  "agents/tests/agent-retired.test.ts": "this test names them to find them"
};

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) yield full;
  }
}

/**
 * A file that must be scanned and must contain a well-known string. Without
 * it, a walk that reached nothing — a moved directory, a changed extension —
 * would report an empty violation list and read as clean.
 */
const SENTINEL = {
  file: "agents/src/task-planner.ts",
  contains: "planMultiTask"
};

describe("the retired Agent loop", () => {
  const scanned = [...sourceFiles(packagesDir)].map((file) => ({
    path: relative(packagesDir, file).split("\\").join("/"),
    text: readFileSync(file, "utf8")
  }));

  it("scanned a non-empty set of sources including a known file", () => {
    expect(scanned.length).toBeGreaterThan(1000);
    const sentinel = scanned.find((f) => f.path === SENTINEL.file);
    expect(sentinel?.text).toContain(SENTINEL.contains);
  });

  it.each(RETIRED)("has no source under packages/ naming %s", (symbol) => {
    const offenders = scanned
      .filter((f) => f.text.includes(symbol) && !(f.path in ALLOWED))
      .map((f) => f.path)
      .sort();

    expect(offenders).toEqual([]);
  });
});
