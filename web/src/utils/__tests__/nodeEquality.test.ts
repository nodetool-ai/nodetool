import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { areNodesEqualIgnoringPosition } from "../nodeEquality";

describe("areNodesEqualIgnoringPosition", () => {
  const createNode = (id: string, x: number, y: number, dataOverride: Partial<NodeData> = {}): Node<NodeData> => ({
    id,
    type: "test",
    position: { x, y },
    data: {
      properties: {},
      dynamic_properties: {},
      workflow_id: "test",
      collapsed: false,
      selectable: true,
      ...dataOverride
    } as NodeData,
  });

  it("returns true for identical arrays", () => {
    const nodes = [createNode("1", 0, 0)];
    expect(areNodesEqualIgnoringPosition(nodes, nodes)).toBe(true);
  });

  it("returns true when position changes but data reference is same", () => {
    const data = {
      properties: {},
      dynamic_properties: {},
      workflow_id: "test",
      collapsed: false,
      selectable: true
    } as NodeData;

    const node1 = createNode("1", 0, 0);
    node1.data = data;

    const node2 = createNode("1", 100, 100);
    node2.data = data;

    expect(areNodesEqualIgnoringPosition([node1], [node2])).toBe(true);
  });

  it("returns false when data reference changes", () => {
    const node1 = createNode("1", 0, 0, { title: "A" });
    const node2 = createNode("1", 0, 0, { title: "A" });
    // New object creation in helper ensures new data ref unless overridden

    expect(areNodesEqualIgnoringPosition([node1], [node2])).toBe(false);
  });

  it("returns false when length differs", () => {
    const node1 = createNode("1", 0, 0);
    expect(areNodesEqualIgnoringPosition([node1], [])).toBe(false);
  });

  it("returns false when id differs", () => {
    const node1 = createNode("1", 0, 0);
    const node2 = createNode("2", 0, 0);
    // Ensure data is same ref to isolate ID check
    node2.data = node1.data;

    expect(areNodesEqualIgnoringPosition([node1], [node2])).toBe(false);
  });

  it("returns false when type differs", () => {
    const node1 = createNode("1", 0, 0);
    const node2 = createNode("1", 0, 0);
    node2.type = "other";
    // Ensure data is same ref to isolate type check
    node2.data = node1.data;

    expect(areNodesEqualIgnoringPosition([node1], [node2])).toBe(false);
  });
});
