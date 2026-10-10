import { describe, expect, it } from "vitest";
import { packageOf, scoreTable, survivors } from "../mutation-score.mjs";

const mutation = (file, start, original, mutant) =>
  JSON.stringify([file, "packages.kernel.src.graph", "defn/topo", start, start + original.length, original, mutant]);

const snapshot = {
  version: 1,
  source: "packages/kernel/src/graph.ts",
  namespace: "packages.kernel.src.graph",
  outcomes: {
    [mutation("packages/kernel/src/graph.ts", 0, "<", "<=")]: "killed",
    [mutation("packages/kernel/src/graph.ts", 8, "!", "")]: "survived"
  },
  forms: [{ id: "defn/topo", file: "packages/kernel/src/graph.ts", killed: 3, survived: 1, uncovered: 2, sites: 6 }]
};

describe("mutation-score", () => {
  it("scores killed over killed plus survived, per package", () => {
    const table = scoreTable([snapshot], ["kernel", "auth"]);
    expect(table).toContain("| `kernel` | 75.00% | 3 / 4 | 2 |");
    expect(table).toContain("| `auth` | ⚠️ no snapshot | — | — |");
    expect(table).toContain("| **Overall** | **75.00%** | **3 / 4** | **2** |");
  });

  it("lists survivors with the line their offset falls on", () => {
    const list = survivors([snapshot], [], () => "a < b\n\nif (!x) {}\n");
    expect(list).toEqual([
      { file: "packages/kernel/src/graph.ts", line: 3, function: "packages.kernel.src.graph topo", mutation: "delete !" }
    ]);
    expect(survivors([snapshot], ["auth"], () => "")).toEqual([]);
  });

  it("maps a file to its package", () => {
    expect(packageOf("packages/node-sdk/src/a.ts")).toBe("node-sdk");
    expect(packageOf("web/src/a.ts")).toBe("web");
  });
});
