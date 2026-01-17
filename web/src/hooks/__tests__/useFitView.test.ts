import { renderHook, act } from "@testing-library/react";
import { useFitView, getNodesBounds } from "../useFitView";
import { Node, Position, XYPosition } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    fitView: jest.fn(),
    fitBounds: jest.fn(),
    getViewport: jest.fn(() => ({ x: 0, y: 0, zoom: 1 }))
  })),
  Position: {
    Left: "left",
    Right: "right",
    Top: "top",
    Bottom: "bottom"
  }
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) => {
    const mockState = {
      nodes: [],
      getSelectedNodes: jest.fn(() => []),
      setSelectedNodes: jest.fn(),
      setViewport: jest.fn()
    };
    return selector(mockState);
  })
}));

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
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
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
  let fitView: jest.Mock;
  let fitBounds: jest.Mock;

  beforeEach(() => {
    fitView = jest.fn();
    fitBounds = jest.fn();
    (require("@xyflow/react").useReactFlow as jest.Mock).mockReturnValue({
      fitView,
      fitBounds,
      getViewport: jest.fn(() => ({ x: 0, y: 0, zoom: 1 }))
    });
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns a function", () => {
    const { result } = renderHook(() => useFitView());
    expect(typeof result.current).toBe("function");
  });

  it("fits all nodes when no nodes are selected", () => {
    (require("../../contexts/NodeContext").useNodes as jest.Mock).mockImplementation((selector) => {
      return selector({
        nodes: [createMockNode("node1", 0, 0, 100, 50)],
        getSelectedNodes: jest.fn(() => []),
        setSelectedNodes: jest.fn(),
        setViewport: jest.fn()
      });
    });

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current();
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(fitBounds).toHaveBeenCalled();
  });

  it("fits selected nodes when nodes are selected", () => {
    const selected = [
      createMockNode("node1", 0, 0, 100, 50),
      createMockNode("node2", 200, 0, 100, 50)
    ];
    (require("../../contexts/NodeContext").useNodes as jest.Mock).mockImplementation((selector) => {
      return selector({
        nodes: [
          createMockNode("node1", 0, 0, 100, 50),
          createMockNode("node2", 200, 0, 100, 50)
        ],
        getSelectedNodes: jest.fn(() => selected),
        setSelectedNodes: jest.fn(),
        setViewport: jest.fn()
      });
    });

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current();
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(fitBounds).toHaveBeenCalled();
  });

  it("fits specific node IDs when provided", () => {
    (require("../../contexts/NodeContext").useNodes as jest.Mock).mockImplementation((selector) => {
      return selector({
        nodes: [
          createMockNode("node1", 0, 0, 100, 50),
          createMockNode("node2", 200, 0, 100, 50),
          createMockNode("node3", 400, 0, 100, 50)
        ],
        getSelectedNodes: jest.fn(() => []),
        setSelectedNodes: jest.fn(),
        setViewport: jest.fn()
      });
    });

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current({ nodeIds: ["node1", "node3"] });
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(fitBounds).toHaveBeenCalled();
  });

  it("uses custom padding when provided", () => {
    (require("../../contexts/NodeContext").useNodes as jest.Mock).mockImplementation((selector) => {
      return selector({
        nodes: [createMockNode("node1", 0, 0, 100, 50)],
        getSelectedNodes: jest.fn(() => []),
        setSelectedNodes: jest.fn(),
        setViewport: jest.fn()
      });
    });

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current({ padding: 0.5 });
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(fitBounds).toHaveBeenCalled();
  });

  it("applies extra left padding to bounds", () => {
    const nodes = [
      createMockNode("node1", 100, 100, 100, 50),
      createMockNode("node2", 300, 100, 100, 50)
    ];
    (require("../../contexts/NodeContext").useNodes as jest.Mock).mockImplementation((selector) => {
      return selector({
        nodes,
        getSelectedNodes: jest.fn(() => nodes),
        setSelectedNodes: jest.fn(),
        setViewport: jest.fn()
      });
    });

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current();
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(fitBounds).toHaveBeenCalledWith(
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
