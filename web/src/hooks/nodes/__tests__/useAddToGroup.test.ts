import { renderHook, act } from "@testing-library/react";
import { useAddToGroup } from "../useAddToGroup";
import { Node } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";

// Mock dependencies
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn(),
  useContext: jest.fn(),
  NodeContext: {}
}));

jest.mock("../useIsGroupable", () => ({
  useIsGroupable: () => ({
    isGroupable: (node: any) => node.type !== "nodetool.group.Loop",
    isGroup: (node: any) => node.type === "nodetool.group.Loop"
  })
}));

jest.mock("../getGroupBounds", () => ({
  getGroupBounds: jest.fn()
}));

import { useNodes } from "../../../contexts/NodeContext";
import { getGroupBounds } from "../getGroupBounds";

const mockUseNodes = useNodes as jest.MockedFunction<typeof useNodes>;
const mockGetGroupBounds = getGroupBounds as jest.MockedFunction<typeof getGroupBounds>;

describe("useAddToGroup", () => {
  const mockUpdateNode = jest.fn();
  const mockNodeContext = {
    getState: jest.fn().mockReturnValue({ nodes: [] })
  };

  const createMockNode = (
    id: string,
    type: string,
    position: { x: number; y: number },
    parentId?: string
  ): Node<NodeData> => ({
    id,
    type,
    position,
    parentId,
    data: {}
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNodes.mockReturnValue({
      updateNode: mockUpdateNode
    });
    mockGetGroupBounds.mockReturnValue({ width: 300, height: 200, offsetX: 0, offsetY: 0 });
  });

  it("returns a function", () => {
    const { result } = renderHook(() => useAddToGroup());
    expect(typeof result.current).toBe("function");
  });

  it("does nothing when nodesToAdd is undefined", () => {
    const { result } = renderHook(() => useAddToGroup());

    act(() => {
      // @ts-expect-error - testing with undefined
      result.current(undefined);
    });

    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("does nothing when nodesToAdd is empty array", () => {
    const { result } = renderHook(() => useAddToGroup());

    act(() => {
      result.current([]);
    });

    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("does not update non-groupable nodes", () => {
    const { result } = renderHook(() => useAddToGroup());
    const parentNode = createMockNode("parent-1", "nodetool.group.Loop", { x: 0, y: 0 });
    const nodesToAdd = [
      createMockNode("node-1", "nodetool.group.Loop", { x: 100, y: 100 })
    ];

    act(() => {
      result.current(nodesToAdd, parentNode);
    });

    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("updates groupable nodes to be children of parent", () => {
    const { result } = renderHook(() => useAddToGroup());
    const parentNode = createMockNode("parent-1", "nodetool.group.Loop", { x: 50, y: 50 });
    const nodesToAdd = [
      createMockNode("node-1", "custom", { x: 100, y: 100 })
    ];

    act(() => {
      result.current(nodesToAdd, parentNode);
    });

    expect(mockUpdateNode).toHaveBeenCalledWith(
      "node-1",
      expect.objectContaining({
        parentId: "parent-1",
        expandParent: true
      })
    );
  });

  it("does not update nodes that already have a parent", () => {
    const { result } = renderHook(() => useAddToGroup());
    const parentNode = createMockNode("parent-1", "nodetool.group.Loop", { x: 50, y: 50 });
    const nodesToAdd = [
      createMockNode("node-1", "custom", { x: 100, y: 100 }, "other-parent")
    ];

    act(() => {
      result.current(nodesToAdd, parentNode);
    });

    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("skips when parent is not a group", () => {
    const { result } = renderHook(() => useAddToGroup());
    const parentNode = createMockNode("parent-1", "custom", { x: 50, y: 50 });
    const nodesToAdd = [
      createMockNode("node-1", "custom", { x: 100, y: 100 })
    ];

    act(() => {
      result.current(nodesToAdd, parentNode);
    });

    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("calculates relative position when adding to group", () => {
    const { result } = renderHook(() => useAddToGroup());
    const parentNode = createMockNode("parent-1", "nodetool.group.Loop", { x: 100, y: 100 });
    const nodesToAdd = [
      createMockNode("node-1", "custom", { x: 150, y: 160 })
    ];

    act(() => {
      result.current(nodesToAdd, parentNode);
    });

    expect(mockUpdateNode).toHaveBeenCalledWith(
      "node-1",
      expect.objectContaining({
        position: { x: 50, y: 60 }
      })
    );
  });

  it("updates parent dimensions after adding nodes", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAddToGroup());
    const parentNode = createMockNode("parent-1", "nodetool.group.Loop", { x: 0, y: 0 });
    const nodesToAdd = [
      createMockNode("node-1", "custom", { x: 100, y: 100 })
    ];

    act(() => {
      result.current(nodesToAdd, parentNode);
    });

    act(() => {
      jest.advanceTimersByTime(20);
    });

    expect(mockGetGroupBounds).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("handles multiple nodes being added", () => {
    const { result } = renderHook(() => useAddToGroup());
    const parentNode = createMockNode("parent-1", "nodetool.group.Loop", { x: 0, y: 0 });
    const nodesToAdd = [
      createMockNode("node-1", "custom", { x: 100, y: 100 }),
      createMockNode("node-2", "custom", { x: 200, y: 200 }),
      createMockNode("node-3", "custom", { x: 300, y: 300 })
    ];

    act(() => {
      result.current(nodesToAdd, parentNode);
    });

    expect(mockUpdateNode).toHaveBeenCalledTimes(3);
  });

  it("updates parent dimensions with calculated bounds", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAddToGroup());
    const parentNode = createMockNode("parent-1", "nodetool.group.Loop", { x: 0, y: 0 });
    const nodesToAdd = [
      createMockNode("node-1", "custom", { x: 100, y: 100 })
    ];
    mockGetGroupBounds.mockReturnValue({ width: 400, height: 300, offsetX: 0, offsetY: 0 });

    act(() => {
      result.current(nodesToAdd, parentNode);
    });

    act(() => {
      jest.advanceTimersByTime(20);
    });

    expect(mockUpdateNode).toHaveBeenCalledWith(
      "parent-1",
      expect.objectContaining({
        width: 400,
        height: 300
      })
    );
    jest.useRealTimers();
  });

  it("does not update parent dimensions when getGroupBounds returns null", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAddToGroup());
    const parentNode = createMockNode("parent-1", "nodetool.group.Loop", { x: 0, y: 0 });
    const nodesToAdd = [
      createMockNode("node-1", "custom", { x: 100, y: 100 })
    ];
    mockGetGroupBounds.mockReturnValue(null);

    act(() => {
      result.current(nodesToAdd, parentNode);
    });

    act(() => {
      jest.advanceTimersByTime(20);
    });

    expect(mockUpdateNode).toHaveBeenCalledTimes(1); // Only the child node update
    jest.useRealTimers();
  });
});
