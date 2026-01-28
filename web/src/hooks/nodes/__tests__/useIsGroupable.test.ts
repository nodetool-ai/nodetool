import { renderHook } from "@testing-library/react";
import { useIsGroupable } from "../useIsGroupable";
import { Node } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";

describe("useIsGroupable", () => {
  const createMockNode = (type: string): Node<NodeData> => ({
    id: "test-node",
    type,
    position: { x: 0, y: 0 },
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "test-workflow"
    }
  });

  it("returns isGroupable and isGroup functions", () => {
    const { result } = renderHook(() => useIsGroupable());

    expect(typeof result.current.isGroupable).toBe("function");
    expect(typeof result.current.isGroup).toBe("function");
  });

  describe("isGroupable", () => {
    it("returns true for regular node types", () => {
      const { result } = renderHook(() => useIsGroupable());
      const node = createMockNode("customNode");

      expect(result.current.isGroupable(node)).toBe(true);
    });

    it("returns true for default node type", () => {
      const { result } = renderHook(() => useIsGroupable());
      const node = createMockNode("default");

      expect(result.current.isGroupable(node)).toBe(true);
    });

    it("returns false for Loop group nodes", () => {
      const { result } = renderHook(() => useIsGroupable());
      const node = createMockNode("nodetool.group.Loop");

      expect(result.current.isGroupable(node)).toBe(false);
    });

    it("returns false for Group nodes", () => {
      const { result } = renderHook(() => useIsGroupable());
      const node = createMockNode("nodetool.workflows.base_node.Group");

      expect(result.current.isGroupable(node)).toBe(false);
    });

    it("returns false for both Loop and Group node types", () => {
      const { result } = renderHook(() => useIsGroupable());
      const loopNode = createMockNode("nodetool.group.Loop");
      const groupNode = createMockNode("nodetool.workflows.base_node.Group");

      expect(result.current.isGroupable(loopNode)).toBe(false);
      expect(result.current.isGroupable(groupNode)).toBe(false);
    });
  });

  describe("isGroup", () => {
    it("returns false for regular node types", () => {
      const { result } = renderHook(() => useIsGroupable());
      const node = createMockNode("customNode");

      expect(result.current.isGroup(node)).toBe(false);
    });

    it("returns false for default node type", () => {
      const { result } = renderHook(() => useIsGroupable());
      const node = createMockNode("default");

      expect(result.current.isGroup(node)).toBe(false);
    });

    it("returns true for Loop group nodes", () => {
      const { result } = renderHook(() => useIsGroupable());
      const node = createMockNode("nodetool.group.Loop");

      expect(result.current.isGroup(node)).toBe(true);
    });

    it("returns true for Group nodes", () => {
      const { result } = renderHook(() => useIsGroupable());
      const node = createMockNode("nodetool.workflows.base_node.Group");

      expect(result.current.isGroup(node)).toBe(true);
    });

    it("returns true for both Loop and Group node types", () => {
      const { result } = renderHook(() => useIsGroupable());
      const loopNode = createMockNode("nodetool.group.Loop");
      const groupNode = createMockNode("nodetool.workflows.base_node.Group");

      expect(result.current.isGroup(loopNode)).toBe(true);
      expect(result.current.isGroup(groupNode)).toBe(true);
    });
  });

  it("functions are stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useIsGroupable());
    const firstIsGroupable = result.current.isGroupable;
    const firstIsGroup = result.current.isGroup;

    rerender();
    expect(result.current.isGroupable).toBe(firstIsGroupable);
    expect(result.current.isGroup).toBe(firstIsGroup);
  });
});
