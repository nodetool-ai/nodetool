import { renderHook, act } from "@testing-library/react";
import { useDuplicateNodes } from "../useDuplicate";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";

jest.mock("@xyflow/react");
jest.mock("../../contexts/NodeContext");
jest.mock("../../config/constants", () => ({
  DUPLICATE_SPACING: 20,
}));
jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid-1234"),
}));

describe("useDuplicateNodes", () => {
  const mockSetNodes = jest.fn();
  const mockSetEdges = jest.fn();
  const mockGetSelectedNodes = jest.fn();
  const mockGenerateNodeIds = jest.fn((count) => Array.from({ length: count }, (_, i) => `new-node-${i}`));

  const mockUseNodesReturn = {
    nodes: [],
    edges: [],
    setNodes: mockSetNodes,
    setEdges: mockSetEdges,
    getSelectedNodes: mockGetSelectedNodes,
    generateNodeIds: mockGenerateNodeIds,
  };

  const mockGetNodesBounds = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useNodes as jest.Mock).mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector(mockUseNodesReturn);
      }
      return mockUseNodesReturn;
    });
    (useReactFlow as jest.Mock).mockReturnValue({
      getNodesBounds: mockGetNodesBounds,
    });
  });

  it("returns a callback function", () => {
    const { result } = renderHook(() => useDuplicateNodes(false));
    expect(typeof result.current).toBe("function");
  });

  it("does nothing when no nodes are selected", () => {
    mockGetSelectedNodes.mockReturnValue([]);

    const { result } = renderHook(() => useDuplicateNodes(false));
    act(() => {
      result.current();
    });

    expect(mockGetNodesBounds).not.toHaveBeenCalled();
    expect(mockSetNodes).not.toHaveBeenCalled();
    expect(mockSetEdges).not.toHaveBeenCalled();
  });

  it("duplicates selected nodes horizontally", () => {
    const selectedNodes = [
      {
        id: "node-1",
        position: { x: 100, y: 200 },
        data: { positionAbsolute: { x: 100, y: 200 } },
        parentId: undefined,
      },
    ];

    mockGetSelectedNodes.mockReturnValue(selectedNodes);
    mockGetNodesBounds.mockReturnValue({ width: 50, height: 30, x: 100, y: 200 });

    const { result } = renderHook(() => useDuplicateNodes(false));
    act(() => {
      result.current();
    });

    expect(mockGenerateNodeIds).toHaveBeenCalledWith(1);
    expect(mockSetNodes).toHaveBeenCalled();
    expect(mockSetEdges).toHaveBeenCalled();
  });

  it("duplicates selected nodes vertically", () => {
    const selectedNodes = [
      {
        id: "node-1",
        position: { x: 100, y: 200 },
        data: { positionAbsolute: { x: 100, y: 200 } },
        parentId: undefined,
      },
    ];

    mockGetSelectedNodes.mockReturnValue(selectedNodes);
    mockGetNodesBounds.mockReturnValue({ width: 50, height: 30, x: 100, y: 200 });

    const { result } = renderHook(() => useDuplicateNodes(true));
    act(() => {
      result.current();
    });

    expect(mockGenerateNodeIds).toHaveBeenCalledWith(1);
    expect(mockSetNodes).toHaveBeenCalled();
  });

  it("applies correct horizontal offset", () => {
    const selectedNodes = [
      {
        id: "node-1",
        position: { x: 100, y: 200 },
        data: { positionAbsolute: { x: 100, y: 200 } },
        parentId: undefined,
      },
    ];

    mockGetSelectedNodes.mockReturnValue(selectedNodes);
    mockGetNodesBounds.mockReturnValue({ width: 50, height: 30, x: 100, y: 200 });

    const { result } = renderHook(() => useDuplicateNodes(false));
    act(() => {
      result.current();
    });

    const setNodesCall = mockSetNodes.mock.calls[0][0];
    const newNode = setNodesCall.find((n: any) => n.id === "new-node-0");
    expect(newNode.position.x).toBe(100 + 50 + 20);
    expect(newNode.position.y).toBe(200);
  });

  it("applies correct vertical offset", () => {
    const selectedNodes = [
      {
        id: "node-1",
        position: { x: 100, y: 200 },
        data: { positionAbsolute: { x: 100, y: 200 } },
        parentId: undefined,
      },
    ];

    mockGetSelectedNodes.mockReturnValue(selectedNodes);
    mockGetNodesBounds.mockReturnValue({ width: 50, height: 30, x: 100, y: 200 });

    const { result } = renderHook(() => useDuplicateNodes(true));
    act(() => {
      result.current();
    });

    const setNodesCall = mockSetNodes.mock.calls[0][0];
    const newNode = setNodesCall.find((n: any) => n.id === "new-node-0");
    expect(newNode.position.x).toBe(100);
    expect(newNode.position.y).toBe(200 + 30 + 20);
  });

  it("deselects original nodes", () => {
    const selectedNodes = [
      {
        id: "node-1",
        position: { x: 100, y: 200 },
        data: { positionAbsolute: { x: 100, y: 200 } },
        parentId: undefined,
      },
    ];

    mockUseNodesReturn.nodes = [
      { id: "node-1", position: { x: 100, y: 200 }, data: { positionAbsolute: { x: 100, y: 200 } }, selected: true },
      { id: "node-2", position: { x: 300, y: 400 }, data: {}, selected: false },
    ];
    mockGetSelectedNodes.mockReturnValue([mockUseNodesReturn.nodes[0]]);
    mockGetNodesBounds.mockReturnValue({ width: 50, height: 30, x: 100, y: 200 });

    const { result } = renderHook(() => useDuplicateNodes(false));
    act(() => {
      result.current();
    });

    const setNodesCall = mockSetNodes.mock.calls[0][0];
    const originalNode = setNodesCall.find((n: any) => n.id === "node-1");
    expect(originalNode.selected).toBe(false);
  });

  it("selects new duplicated nodes", () => {
    const selectedNodes = [
      {
        id: "node-1",
        position: { x: 100, y: 200 },
        data: { positionAbsolute: { x: 100, y: 200 } },
        parentId: undefined,
      },
    ];

    mockGetSelectedNodes.mockReturnValue(selectedNodes);
    mockGetNodesBounds.mockReturnValue({ width: 50, height: 30, x: 100, y: 200 });

    const { result } = renderHook(() => useDuplicateNodes(false));
    act(() => {
      result.current();
    });

    const setNodesCall = mockSetNodes.mock.calls[0][0];
    const newNode = setNodesCall.find((n: any) => n.id === "new-node-0");
    expect(newNode.selected).toBe(true);
  });

  it("handles multiple selected nodes", () => {
    const selectedNodes = [
      {
        id: "node-1",
        position: { x: 100, y: 200 },
        data: { positionAbsolute: { x: 100, y: 200 } },
        parentId: undefined,
      },
      {
        id: "node-2",
        position: { x: 200, y: 300 },
        data: { positionAbsolute: { x: 200, y: 300 } },
        parentId: undefined,
      },
    ];

    mockGetSelectedNodes.mockReturnValue(selectedNodes);
    mockGetNodesBounds.mockReturnValue({ width: 150, height: 130, x: 100, y: 200 });

    const { result } = renderHook(() => useDuplicateNodes(false));
    act(() => {
      result.current();
    });

    expect(mockGenerateNodeIds).toHaveBeenCalledWith(2);
  });

  it("duplicates edges between selected nodes", () => {
    const selectedNodes = [
      {
        id: "node-1",
        position: { x: 100, y: 200 },
        data: { positionAbsolute: { x: 100, y: 200 } },
        parentId: undefined,
      },
      {
        id: "node-2",
        position: { x: 200, y: 300 },
        data: { positionAbsolute: { x: 200, y: 300 } },
        parentId: undefined,
      },
    ];

    mockUseNodesReturn.edges = [
      { id: "edge-1", source: "node-1", target: "node-2" },
      { id: "edge-2", source: "node-2", target: "node-3" },
    ];
    mockGetSelectedNodes.mockReturnValue(selectedNodes);
    mockGetNodesBounds.mockReturnValue({ width: 150, height: 130, x: 100, y: 200 });

    const { result } = renderHook(() => useDuplicateNodes(false));
    act(() => {
      result.current();
    });

    const setEdgesCall = mockSetEdges.mock.calls[0][0];
    expect(setEdgesCall.length).toBe(3);

    const duplicatedEdge = setEdgesCall.find((e: any) => e.source === "new-node-0" && e.target === "new-node-1");
    expect(duplicatedEdge).toBeDefined();
    expect(duplicatedEdge.id).toBe("mock-uuid-1234");
    const externalEdge = setEdgesCall.find((e: any) => e.target === "node-3");
    expect(externalEdge).toBeDefined();
  });

  it("does not duplicate edges connected to unselected nodes", () => {
    const selectedNodes = [
      {
        id: "node-1",
        position: { x: 100, y: 200 },
        data: { positionAbsolute: { x: 100, y: 200 } },
        parentId: undefined,
      },
    ];

    mockUseNodesReturn.edges = [
      { id: "edge-1", source: "node-1", target: "node-2" },
    ];
    mockGetSelectedNodes.mockReturnValue(selectedNodes);
    mockGetNodesBounds.mockReturnValue({ width: 50, height: 30, x: 100, y: 200 });

    const { result } = renderHook(() => useDuplicateNodes(false));
    act(() => {
      result.current();
    });

    const setEdgesCall = mockSetEdges.mock.calls[0][0];
    expect(setEdgesCall.length).toBe(1);
    const externalEdge = setEdgesCall.find((e: any) => e.target === "node-2");
    expect(externalEdge).toBeDefined();
    expect(externalEdge.id).toBe("edge-1");
  });

  it("handles nodes with parentId correctly", () => {
    const selectedNodes = [
      {
        id: "child-node",
        position: { x: 150, y: 250 },
        data: { positionAbsolute: { x: 150, y: 250 } },
        parentId: "parent-node",
      },
    ];

    mockGetSelectedNodes.mockReturnValue(selectedNodes);
    mockGetNodesBounds.mockReturnValue({ width: 50, height: 30, x: 100, y: 200 });

    const { result } = renderHook(() => useDuplicateNodes(false));
    act(() => {
      result.current();
    });

    const setNodesCall = mockSetNodes.mock.calls[0][0];
    const newNode = setNodesCall.find((n: any) => n.id === "new-node-0");
    expect(newNode.parentId).toBe("parent-node");
    expect(newNode.position.x).toBe(150 + 50 + 20);
  });
});
