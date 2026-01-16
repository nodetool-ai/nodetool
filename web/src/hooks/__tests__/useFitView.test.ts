import { renderHook, act } from "@testing-library/react";
import { useFitView, getNodesBounds } from "../useFitView";
import { Node, XYPosition } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

const mockFitView = jest.fn();
const mockFitBounds = jest.fn();
const mockGetViewport = jest.fn(() => ({ x: 0, y: 0, zoom: 1 }));

jest.mock("@xyflow/react", () => {
  const mockUseReactFlow = jest.fn();
  return {
    useReactFlow: mockUseReactFlow
  };
});

jest.mock("../../contexts/NodeContext", () => {
  const mockUseNodes = jest.fn();
  return {
    useNodes: mockUseNodes
  };
});

import { useNodes } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";

const createMockNode = (
  id: string,
  x: number,
  y: number,
  width?: number,
  height?: number,
  parentId?: string
): Node<NodeData> => ({
  id,
  type: "test",
  position: { x, y },
  targetPosition: "left" as any,
  sourcePosition: "right" as any,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test-workflow"
  },
  measured: width ? { width, height: height || 50 } : undefined,
  parentId
});

describe("useFitView", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockFitView.mockReset();
    mockFitBounds.mockReset();
    mockGetViewport.mockReturnValue({ x: 0, y: 0, zoom: 1 });
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [],
        getSelectedNodes: jest.fn(() => []),
        setSelectedNodes: jest.fn(),
        setViewport: jest.fn()
      })
    );
    (useReactFlow as unknown as jest.Mock).mockReturnValue({
      fitView: mockFitView,
      fitBounds: mockFitBounds,
      getViewport: mockGetViewport
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns a function", () => {
    const { result } = renderHook(() => useFitView());
    expect(typeof result.current).toBe("function");
  });

  it("fits all nodes when no nodes are selected", () => {
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [createMockNode("node1", 0, 0, 100, 50)],
        getSelectedNodes: jest.fn(() => []),
        setSelectedNodes: jest.fn(),
        setViewport: jest.fn()
      })
    );

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current();
    });

    expect(mockFitView).toHaveBeenCalledWith({ duration: 800, padding: 0.1 });
  });

  it("fits selected nodes when nodes are selected", () => {
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [
          createMockNode("node1", 0, 0, 100, 50),
          createMockNode("node2", 200, 0, 100, 50)
        ],
        getSelectedNodes: jest.fn(() => [
          createMockNode("node1", 0, 0, 100, 50),
          createMockNode("node2", 200, 0, 100, 50)
        ]),
        setSelectedNodes: jest.fn(),
        setViewport: jest.fn()
      })
    );

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current();
    });

    expect(mockFitBounds).toHaveBeenCalled();
  });

  it("fits specific node IDs when provided", () => {
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [
          createMockNode("node1", 0, 0, 100, 50),
          createMockNode("node2", 200, 0, 100, 50),
          createMockNode("node3", 400, 0, 100, 50)
        ],
        getSelectedNodes: jest.fn(() => []),
        setSelectedNodes: jest.fn(),
        setViewport: jest.fn()
      })
    );

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current({ nodeIds: ["node1", "node3"] });
    });

    expect(mockFitBounds).toHaveBeenCalled();
  });

  it("uses custom padding when provided", () => {
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [createMockNode("node1", 0, 0, 100, 50)],
        getSelectedNodes: jest.fn(() => []),
        setSelectedNodes: jest.fn(),
        setViewport: jest.fn()
      })
    );

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current({ padding: 0.5 });
    });

    expect(mockFitView).toHaveBeenCalledWith({ duration: 800, padding: 0.5 });
  });

  it("applies extra left padding to bounds", () => {
    const nodes = [
      createMockNode("node1", 100, 100, 100, 50),
      createMockNode("node2", 300, 100, 100, 50)
    ];
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes,
        getSelectedNodes: jest.fn(() => nodes),
        setSelectedNodes: jest.fn(),
        setViewport: jest.fn()
      })
    );

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current();
    });

    expect(mockFitBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        x: expect.any(Number)
      }),
      expect.any(Object)
    );
  });
});

describe("getNodesBounds", () => {
  it("returns null for empty nodes array", () => {
    const result = getNodesBounds([], {});
    expect(result).toBeNull();
  });

  it("calculates bounds correctly for single node", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("node1", 100, 200, 150, 60)
    ];
    const nodesById: Record<string, XYPosition> = {
      node1: { x: 100, y: 200 }
    };

    const result = getNodesBounds(nodes, nodesById);

    expect(result).toEqual({
      xMin: 100,
      xMax: 250,
      yMin: 200,
      yMax: 260
    });
  });

  it("calculates bounds correctly for multiple nodes", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("node1", 100, 100, 100, 50),
      createMockNode("node2", 300, 200, 100, 50)
    ];
    const nodesById: Record<string, XYPosition> = {
      node1: { x: 100, y: 100 },
      node2: { x: 300, y: 200 }
    };

    const result = getNodesBounds(nodes, nodesById);

    expect(result).toEqual({
      xMin: 100,
      xMax: 400,
      yMin: 100,
      yMax: 250
    });
  });

  it("handles nodes without measured dimensions", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("node1", 100, 100, undefined, undefined)
    ];
    const nodesById: Record<string, XYPosition> = {
      node1: { x: 100, y: 100 }
    };

    const result = getNodesBounds(nodes, nodesById);

    expect(result).toEqual({
      xMin: 100,
      xMax: 100,
      yMin: 100,
      yMax: 100
    });
  });

  it("includes parent position for child nodes", () => {
    const nodes: Node<NodeData>[] = [
      createMockNode("child1", 50, 50, 100, 50, "parent")
    ];
    const nodesById: Record<string, XYPosition> = {
      child1: { x: 50, y: 50 },
      parent: { x: 200, y: 300 }
    };

    const result = getNodesBounds(nodes, nodesById);

    expect(result).toEqual({
      xMin: 250,
      xMax: 350,
      yMin: 350,
      yMax: 400
    });
  });
});
