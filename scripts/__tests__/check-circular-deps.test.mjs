import { describe, expect, it } from "vitest";

import {
  findCycles
} from "../check-circular-deps.mjs";

describe("circular dependency audit", () => {
  it("reports a deliberately circular graph", () => {
    const result = findCycles(new Map([
      ["/repo/a.ts", new Set(["/repo/b.ts"])],
      ["/repo/b.ts", new Set(["/repo/a.ts"])]
    ]));

    expect(result).toEqual([["/repo/a.ts", "/repo/b.ts"]]);
  });

  it("returns no cycles for an acyclic graph", () => {
    expect(findCycles(new Map([
      ["/repo/a.ts", new Set(["/repo/b.ts"])],
      ["/repo/b.ts", new Set()]
    ]))).toEqual([]);
  });
});
