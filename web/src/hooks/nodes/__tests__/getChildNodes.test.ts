import { getChildNodes } from "../getChildNodes";
import { Node } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";

describe("getChildNodes", () => {
  const createMockNode = (
    id: string,
    parentId?: string
  ): Node<NodeData> => ({
    id,
    type: "default",
    position: { x: 0, y: 0 },
    data: {},
    parentId
  });

  it("returns empty array when no nodes exist", () => {
    const result = getChildNodes([], "parent-1");
    expect(result).toEqual([]);
  });

  it("returns empty array when no children match parentId", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("node-1", "parent-2"),
      createMockNode("node-2", "parent-3")
    ];
    const result = getChildNodes(nodes, "parent-1");
    expect(result).toEqual([]);
  });

  it("returns all direct children of specified parent", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("node-1", "parent-1"),
      createMockNode("node-2", "parent-1"),
      createMockNode("node-3", "parent-2")
    ];
    const result = getChildNodes(nodes, "parent-1");
    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id)).toEqual(["node-1", "node-2"]);
  });

  it("returns empty array for nodes with undefined parentId", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("node-1", undefined),
      createMockNode("node-2", undefined)
    ];
    const result = getChildNodes(nodes, "parent-1");
    expect(result).toEqual([]);
  });

  it("returns empty array for nodes with null parentId", () => {
    const nodes: Node<NodeData>[] = [
      { ...createMockNode("node-1"), parentId: null as any }
    ];
    const result = getChildNodes(nodes, "parent-1");
    expect(result).toEqual([]);
  });

  it("handles nested parentId strings correctly", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("node-1", "parent-1"),
      createMockNode("node-2", "parent-10"),
      createMockNode("node-3", "parent-1")
    ];
    const result = getChildNodes(nodes, "parent-1");
    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id)).toEqual(["node-1", "node-3"]);
  });

  it("preserves node data in returned children", () => {
    const nodes: Node<NodeData>[] = [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 200 },
        data: { customProp: "test" },
        parentId: "parent-1"
      }
    ];
    const result = getChildNodes(nodes, "parent-1");
    expect(result).toHaveLength(1);
    expect(result[0].data.customProp).toBe("test");
    expect(result[0].position).toEqual({ x: 100, y: 200 });
  });
});
