import { renderHook, act } from "@testing-library/react";
import { useRemoveFromGroup } from "../useRemoveFromGroup";
import { Node } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";
import * as NodeContext from "../../../contexts/NodeContext";

describe("useRemoveFromGroup", () => {
  const mockUpdateNode = jest.fn();
  const mockFindNode = jest.fn();

  const createMockNode = (
    id: string,
    position: { x: number; y: number },
    parentId?: string
  ): Node<NodeData> => ({
    id,
    type: "default",
    position,
    parentId,
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "test-workflow"
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const { useNodes } = NodeContext;

    (useNodes as jest.Mock).mockReturnValue({
      updateNode: mockUpdateNode,
      findNode: mockFindNode
    });
  });

  it("returns a function", () => {
    const { result } = renderHook(() => useRemoveFromGroup());
    expect(typeof result.current).toBe("function");
  });

  it("does nothing when nodesToRemove is undefined", () => {
    const { result } = renderHook(() => useRemoveFromGroup());

    act(() => {
      result.current(undefined);
    });

    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("does nothing when nodesToRemove is empty array", () => {
    const { result } = renderHook(() => useRemoveFromGroup());

    act(() => {
      result.current([]);
    });

    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("does nothing when all nodes have no parentId", () => {
    const { result } = renderHook(() => useRemoveFromGroup());
    const nodesToRemove = [
      createMockNode("node-1", { x: 100, y: 100 }),
      createMockNode("node-2", { x: 200, y: 200 })
    ];

    act(() => {
      result.current(nodesToRemove);
    });

    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("updates nodes with parentId to remove from group", () => {
    const { result } = renderHook(() => useRemoveFromGroup());
    const parentNode = createMockNode("parent-1", { x: 50, y: 50 });
    const nodesToRemove = [
      createMockNode("node-1", { x: 20, y: 30 }, "parent-1"),
      createMockNode("node-2", { x: 40, y: 50 }, "parent-1")
    ];

    mockFindNode.mockReturnValue(parentNode);

    act(() => {
      result.current(nodesToRemove);
    });

    expect(mockUpdateNode).toHaveBeenCalledTimes(2);
  });

  it("calculates absolute position when removing from group", () => {
    const { result } = renderHook(() => useRemoveFromGroup());
    const parentNode = createMockNode("parent-1", { x: 100, y: 100 });
    const nodesToRemove = [
      createMockNode("node-1", { x: 50, y: 60 }, "parent-1")
    ];

    mockFindNode.mockReturnValue(parentNode);

    act(() => {
      result.current(nodesToRemove);
    });

    expect(mockUpdateNode).toHaveBeenCalledWith(
      "node-1",
      expect.objectContaining({
        parentId: undefined,
        position: { x: 150, y: 160 }
      })
    );
  });

  it("skips parent nodes that are not found", () => {
    const { result } = renderHook(() => useRemoveFromGroup());
    const nodesToRemove = [
      createMockNode("node-1", { x: 50, y: 60 }, "parent-1"),
      createMockNode("node-2", { x: 70, y: 80 }, "parent-2")
    ];

    mockFindNode.mockReturnValue(undefined);

    act(() => {
      result.current(nodesToRemove);
    });

    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("skips parent nodes without position", () => {
    const { result } = renderHook(() => useRemoveFromGroup());
    const nodesToRemove = [
      createMockNode("node-1", { x: 50, y: 60 }, "parent-1")
    ];

    mockFindNode.mockReturnValue({ id: "parent-1", position: undefined } as any);

    act(() => {
      result.current(nodesToRemove);
    });

    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("groups nodes by parent before updating", () => {
    const { result } = renderHook(() => useRemoveFromGroup());
    const parentNode1 = createMockNode("parent-1", { x: 50, y: 50 });
    const parentNode2 = createMockNode("parent-2", { x: 100, y: 100 });
    const nodesToRemove = [
      createMockNode("node-1", { x: 20, y: 30 }, "parent-1"),
      createMockNode("node-2", { x: 40, y: 50 }, "parent-2"),
      createMockNode("node-3", { x: 30, y: 40 }, "parent-1")
    ];

    mockFindNode.mockImplementation((id: string) => {
      if (id === "parent-1") {return parentNode1;}
      if (id === "parent-2") {return parentNode2;}
      return undefined;
    });

    act(() => {
      result.current(nodesToRemove);
    });

    expect(mockUpdateNode).toHaveBeenCalledTimes(3);
  });

  it("sets selected to false when removing from group", () => {
    const { result } = renderHook(() => useRemoveFromGroup());
    const parentNode = createMockNode("parent-1", { x: 50, y: 50 });
    const nodesToRemove = [
      createMockNode("node-1", { x: 20, y: 30 }, "parent-1")
    ];

    mockFindNode.mockReturnValue(parentNode);

    act(() => {
      result.current(nodesToRemove);
    });

    expect(mockUpdateNode).toHaveBeenCalledWith(
      "node-1",
      expect.objectContaining({
        selected: false
      })
    );
  });

  it("handles nodes with missing position gracefully", () => {
    const { result } = renderHook(() => useRemoveFromGroup());
    const parentNode = createMockNode("parent-1", { x: 50, y: 50 });
    const nodesToRemove = [
      { id: "node-1", type: "default", position: undefined, parentId: "parent-1", data: {} } as any
    ];

    mockFindNode.mockReturnValue(parentNode);

    act(() => {
      result.current(nodesToRemove);
    });

    expect(mockUpdateNode).toHaveBeenCalledWith(
      "node-1",
      expect.objectContaining({
        position: { x: 50, y: 50 }
      })
    );
  });
});
