import type { Node } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";
import { areNodesEqualIgnoringPosition } from "../nodeEquality";

const data = {} as NodeData;
const node = (
  id: string,
  extra: Partial<Node<NodeData>> = {}
): Node<NodeData> => ({
  id,
  type: "t",
  position: { x: 0, y: 0 },
  data,
  ...extra
});

describe("areNodesEqualIgnoringPosition", () => {
  it("is true for the same array", () => {
    const nodes = [node("a")];
    expect(areNodesEqualIgnoringPosition(nodes, nodes)).toBe(true);
  });

  it("ignores position, selection and dragging", () => {
    const prev = [node("a")];
    const next = [
      node("a", { position: { x: 50, y: 9 }, selected: true, dragging: true })
    ];
    expect(areNodesEqualIgnoringPosition(prev, next)).toBe(true);
  });

  it("detects length, id, type and data changes", () => {
    const base = [node("a")];
    expect(areNodesEqualIgnoringPosition(base, [])).toBe(false);
    expect(areNodesEqualIgnoringPosition(base, [node("b")])).toBe(false);
    expect(areNodesEqualIgnoringPosition(base, [node("a", { type: "u" })])).toBe(
      false
    );
    expect(
      areNodesEqualIgnoringPosition(base, [node("a", { data: {} as NodeData })])
    ).toBe(false);
  });
});
