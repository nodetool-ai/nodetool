import type { Node } from "@xyflow/react";
import { withGroupContents } from "../withGroupContents";

const node = (id: string, parentId?: string): Node<Record<string, unknown>> => ({
  id,
  parentId,
  position: { x: 0, y: 0 },
  data: {}
});

describe("withGroupContents", () => {
  const nodes = [
    node("group"),
    node("child", "group"),
    node("loop", "group"),
    node("loop-child", "loop"),
    node("outside")
  ];
  const ids = (result: Node[]) => result.map((n) => n.id);

  it("adds everything inside a group, at any depth", () => {
    expect(ids(withGroupContents(["group"], nodes))).toEqual([
      "group",
      "child",
      "loop",
      "loop-child"
    ]);
  });

  it("keeps a plain selection as it is", () => {
    expect(ids(withGroupContents(["child", "outside"], nodes))).toEqual([
      "child",
      "outside"
    ]);
  });

  it("ignores ids that name no node", () => {
    expect(ids(withGroupContents(["missing"], nodes))).toEqual([]);
  });
});
