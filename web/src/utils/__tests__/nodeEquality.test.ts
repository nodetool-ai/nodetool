import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { areNodesEqualIgnoringPosition } from "../nodeEquality";

const makeNode = (
  id: string,
  data: NodeData,
  extra: Partial<Node<NodeData>> = {}
): Node<NodeData> => ({
  id,
  type: "nodetool.test",
  position: { x: 0, y: 0 },
  data,
  ...extra
});

describe("areNodesEqualIgnoringPosition", () => {
  const data = { properties: {} } as unknown as NodeData;

  it("is true for the same array reference and for two empty arrays", () => {
    const nodes = [makeNode("a", data)];
    expect(areNodesEqualIgnoringPosition(nodes, nodes)).toBe(true);
    expect(areNodesEqualIgnoringPosition([], [])).toBe(true);
  });

  it("ignores position, selection, and dragging changes", () => {
    const prev = [makeNode("a", data)];
    const next = [
      makeNode("a", data, {
        position: { x: 100, y: 50 },
        selected: true,
        dragging: true
      })
    ];
    expect(areNodesEqualIgnoringPosition(prev, next)).toBe(true);
  });

  it("detects length, id, type, and data-reference changes", () => {
    const base = [makeNode("a", data)];
    expect(areNodesEqualIgnoringPosition(base, [])).toBe(false);
    expect(areNodesEqualIgnoringPosition(base, [makeNode("b", data)])).toBe(
      false
    );
    expect(
      areNodesEqualIgnoringPosition(base, [
        makeNode("a", data, { type: "other" })
      ])
    ).toBe(false);
    expect(
      areNodesEqualIgnoringPosition(base, [makeNode("a", { ...data })])
    ).toBe(false);
  });
});
