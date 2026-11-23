import type { MarkdownBlockDocument } from "@nodetool-ai/protocol";
import {
  diffBlockChanges,
  mergeBlockChanges,
  revertBlockChange
} from "../documentChanges";

const doc = (...blocks: Array<[string, string]>): MarkdownBlockDocument => ({
  leading: "",
  blocks: blocks.map(([id, text], index) => ({
    id,
    text,
    kind: "paragraph",
    gap: index === blocks.length - 1 ? "\n" : "\n\n"
  }))
});

describe("documentChanges", () => {
  const before = doc(["a", "alpha"], ["b", "beta"], ["c", "gamma"]);
  const after = doc(["a", "alpha!"], ["c", "gamma"], ["d", "delta"]);

  it("lists modified, inserted and deleted blocks", () => {
    expect(diffBlockChanges(before, after)).toEqual([
      { kind: "modified", blockId: "a", previous: "alpha" },
      { kind: "inserted", blockId: "d" },
      {
        kind: "deleted",
        blockId: "b",
        previous: before.blocks[1],
        afterId: "a"
      }
    ]);
  });

  it("reverts each change back to the first state", () => {
    let current = after;
    for (const change of diffBlockChanges(before, after)) {
      current = revertBlockChange(current, change);
    }
    expect(current.blocks.map((block) => [block.id, block.text])).toEqual([
      ["a", "alpha"],
      ["b", "beta"],
      ["c", "gamma"]
    ]);
  });

  it("keeps the earliest content across writes and drops insert-then-delete", () => {
    const first = diffBlockChanges(before, after);
    const second = diffBlockChanges(after, doc(["a", "alpha!!"], ["c", "gamma"]));
    const merged = mergeBlockChanges(first, second);
    expect(merged).toContainEqual({ kind: "modified", blockId: "a", previous: "alpha" });
    expect(merged.some((change) => change.blockId === "d")).toBe(false);
  });

  it("restores a deleted last block with the file's final gap", () => {
    const end = doc(["a", "one"], ["b", "two"]);
    const cut = doc(["a", "one"]);
    const [change] = diffBlockChanges(end, cut);
    const restored = revertBlockChange(cut, change);
    expect(restored.blocks.map((block) => block.gap)).toEqual(["\n\n", "\n"]);
  });
});
