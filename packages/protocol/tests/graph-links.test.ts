import { describe, expect, it } from "vitest";
import {
  addGraphLink,
  pruneGraphLinks,
  removeGraphLink,
  workflowDocumentRevision
} from "../src/index.js";

const ids = new Set(["a", "b", "c"]);
let n = 0;
const newId = () => `link-${++n}`;

describe("graph links", () => {
  it("adds, dedupes, and rejects bad endpoints", () => {
    const first = addGraphLink(ids, [], { source: "a", target: "b" }, newId);
    expect(first.ok && first.value.links).toHaveLength(1);
    if (!first.ok) throw new Error("unreachable");

    const again = addGraphLink(
      ids,
      first.value.links,
      { source: "a", target: "b" },
      newId
    );
    expect(again.ok && again.value.link.id).toBe(first.value.link.id);
    expect(again.ok && again.value.links).toHaveLength(1);

    expect(addGraphLink(ids, [], { source: "a", target: "a" }, newId).ok).toBe(false);
    expect(addGraphLink(ids, [], { source: "a", target: "z" }, newId).ok).toBe(false);
  });

  it("removes by id and prunes dangling links", () => {
    const links = [
      { id: "1", source: "a", target: "b" },
      { id: "2", source: "b", target: "c" }
    ];
    const removed = removeGraphLink(links, "1");
    expect(removed.ok && removed.value.map((l) => l.id)).toEqual(["2"]);
    expect(removeGraphLink(links, "x").ok).toBe(false);
    expect(
      pruneGraphLinks(new Set(["a", "b"]), links).map((l) => l.id)
    ).toEqual(["1"]);
  });

  it("changes the document revision only when links exist", () => {
    const without = workflowDocumentRevision("wf", [], []);
    expect(workflowDocumentRevision("wf", [], [], [])).toBe(without);
    expect(
      workflowDocumentRevision("wf", [], [], [{ id: "1", source: "a", target: "b" }])
    ).not.toBe(without);
  });
});
