import { describe, expect, it } from "vitest";
import { selectSites } from "../src/engine.js";
import { formKey } from "../src/forms.js";
import type { Site } from "../src/model.js";
import type { History } from "../src/snapshot.js";

const KEY = formKey("ns", "fn");
const SITE = { mutationId: "m1", line: 3, namespace: "ns", formId: "fn" } as Site;

interface Case {
  covered: boolean | undefined;
  lines: "none" | "hit" | "miss";
  changed: "none" | "in" | "out";
  priorDigest: string | undefined;
  digest: string | undefined;
  outcome: "killed" | "survived" | undefined;
  mutateAll: boolean;
}

function select(c: Case): boolean {
  const history: History = {
    forms: new Map(c.priorDigest === undefined ? [] : [[KEY, c.priorDigest]]),
    outcomes: new Map(c.outcome === undefined ? [] : [["m1", c.outcome]])
  };
  const digests = new Map(c.digest === undefined ? [] : [[KEY, c.digest]]);
  const covered = new Map(c.covered === undefined ? [] : [["m1", c.covered]]);
  const lines = c.lines === "none" ? null : new Set([c.lines === "hit" ? 3 : 4]);
  const changed = c.changed === "none" ? null : new Set(c.changed === "in" ? [KEY] : []);
  return selectSites([SITE], covered, history, digests, c.mutateAll, lines, changed).length === 1;
}

const base: Case = {
  covered: true,
  lines: "none",
  changed: "none",
  priorDigest: "d",
  digest: "d",
  outcome: "killed",
  mutateAll: false
};

describe("selectSites", () => {
  it.each<[string, Partial<Case>, boolean]>([
    ["skips a killed mutant in an unchanged function", {}, false],
    ["retries a survivor in an unchanged function", { outcome: "survived" }, true],
    ["runs a site with no recorded outcome in an unchanged function", { outcome: undefined }, true],
    ["reruns a killed mutant when the function digest changed", { digest: "e" }, true],
    ["runs every site when the form has no prior digest", { priorDigest: undefined }, true],
    ["runs a killed site when the form has no current digest", { digest: undefined }, true],
    ["reruns a killed mutant under mutateAll", { mutateAll: true }, true],
    ["skips an uncovered site even under mutateAll", { covered: false, mutateAll: true }, false],
    ["skips a site with no coverage entry", { covered: undefined, outcome: "survived" }, false],
    ["skips a site outside the requested lines", { lines: "miss", outcome: "survived" }, false],
    ["keeps a site on a requested line", { lines: "hit", outcome: "survived" }, true],
    ["skips a site whose form is outside the changed set", { changed: "out", mutateAll: true }, false],
    ["keeps a survivor whose form is in the changed set", { changed: "in", outcome: "survived" }, true]
  ])("%s", (_name, override, expected) => {
    expect(select({ ...base, ...override })).toBe(expected);
  });

  it("agrees with the filter order across every combination", () => {
    let checked = 0;
    for (const covered of [true, false, undefined])
      for (const lines of ["none", "hit", "miss"] as const)
        for (const changed of ["none", "in", "out"] as const)
          for (const priorDigest of [undefined, "d", "x"])
            for (const digest of [undefined, "d"])
              for (const outcome of [undefined, "killed", "survived"] as const)
                for (const mutateAll of [true, false]) {
                  const c: Case = { covered, lines, changed, priorDigest, digest, outcome, mutateAll };
                  const unchanged = priorDigest !== undefined && priorDigest === digest;
                  const expected =
                    covered === true &&
                    lines !== "miss" &&
                    changed !== "out" &&
                    (mutateAll || !unchanged || outcome !== "killed");
                  expect(select(c), JSON.stringify(c)).toBe(expected);
                  checked += 1;
                }
    expect(checked).toBe(972);
  });
});
