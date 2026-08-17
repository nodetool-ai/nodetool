/**
 * @jest-environment node
 */
import { foldDocAt } from "../docReplay";
import type { DocCastEvent } from "../docCastTypes";

interface Doc {
  title: string;
  items: string[];
}

const base: Doc = { title: "one", items: [] };
const events: DocCastEvent<Doc>[] = [
  { t: 100, patch: { items: ["a"] } },
  { t: 200, patch: { title: "two" } },
  { t: 300, patch: { items: ["a", "b"] } }
];

describe("foldDocAt", () => {
  it("returns the base document before the first patch", () => {
    expect(foldDocAt(base, events, 0)).toEqual({ title: "one", items: [] });
    expect(foldDocAt(base, events, 99)).toEqual({ title: "one", items: [] });
  });

  it("applies every patch with t <= timeMs, in order", () => {
    expect(foldDocAt(base, events, 100)).toEqual({ title: "one", items: ["a"] });
    expect(foldDocAt(base, events, 250)).toEqual({ title: "two", items: ["a"] });
    expect(foldDocAt(base, events, 10_000)).toEqual({
      title: "two",
      items: ["a", "b"]
    });
  });

  it("is a pure function of time — seeking backwards drops later patches", () => {
    foldDocAt(base, events, 10_000);
    expect(foldDocAt(base, events, 100)).toEqual({ title: "one", items: ["a"] });
  });

  it("never mutates the base document or a patch", () => {
    const folded = foldDocAt(base, events, 10_000);
    folded.items.push("c");
    expect(base.items).toEqual([]);
    expect(events[2].patch.items).toEqual(["a", "b"]);
  });
});
