import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs, run } from "../src/cli.js";
import { MATH_PACKAGE, project } from "./fixture.js";

const io = { out: (_text: string) => {}, err: (_text: string) => {} };
const command = ["--no-coverage", "--test-command", "node tests/run.mjs"];

function snapshot(root: string) {
  return JSON.parse(readFileSync(join(root, ".metrics/mutate/packages.math.src.math.json"), "utf8"));
}

describe("mutation shards", () => {
  it("validates a one-based shard without changing default selection", () => {
    expect(parseArgs(["--shard", "1/2"])).toMatchObject({ shard: { index: 1, count: 2 } });
    expect(parseArgs([])).toMatchObject({ shard: null });
    for (const value of ["0/2", "3/2", "1/0", "1.5/2", "1/2/3", "1", "-1/2", "1/Infinity"]) {
      expect(() => parseArgs(["--shard", value])).toThrow();
    }
  });

  it("executes every original mutant exactly once across independent shard roots", async () => {
    const full = project(MATH_PACKAGE);
    expect(await run(["--root", full, ...command, join(full, "packages/math/src")], io)).toBe(3);
    const original = snapshot(full);
    const outcomes: Array<[string, string]> = [];
    let killed = 0;
    let survived = 0;
    let sites = 0;
    for (const index of [1, 2]) {
      const root = project(MATH_PACKAGE);
      const source = join(root, "packages/math/src/math.mjs");
      const before = readFileSync(source, "utf8");
      const code = await run(["--root", root, ...command, "--shard", `${index}/2`, source], io);
      expect([0, 3]).toContain(code);
      const partial = snapshot(root);
      outcomes.push(...Object.entries<string>(partial.outcomes));
      for (const form of partial.forms) {
        killed += form.killed;
        survived += form.survived;
        sites += form.sites;
      }
      expect(readFileSync(source, "utf8")).toBe(before);
    }
    expect(outcomes).toHaveLength(Object.keys(original.outcomes).length);
    expect(new Set(outcomes.map(([id]) => id)).size).toBe(outcomes.length);
    expect(Object.fromEntries(outcomes)).toEqual(original.outcomes);
    expect({ killed, survived, sites }).toEqual({ killed: 1, survived: 2, sites: 3 });
  });

  it("reports actual executions separately from outcomes carried from history", async () => {
    const root = project(MATH_PACKAGE);
    const source = join(root, "packages/math/src/math.mjs");
    await run(["--root", root, ...command, source], io);
    const completed: string[] = [];
    const selected: string[] = [];
    expect(await run(["--root", root, ...command, "--shard", "1/1", source], io, undefined, {
      selection: (_file, ids) => selected.push(...ids),
      completed: (id) => completed.push(id)
    })).toBe(3);
    expect(completed).toHaveLength(2);
    expect(completed.sort()).toEqual(selected.sort());
    expect(Object.keys(snapshot(root).outcomes)).toHaveLength(3);
  });
});
