import { makeNodeStore, nodeStoreRenderers } from "../../test-utils/nodeStore";
import { act } from "@testing-library/react";
import useAlignNodes from "../useAlignNodes";
import { Node, Position } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

// Store the setNodes mock so we can capture calls to it
let mockSetNodes: jest.Mock;
let mockNodes: Node<NodeData>[] = [];
let mockSelectedNodes: Node<NodeData>[] = [];

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(),
  Position: {
    Left: "left",
    Right: "right",
    Top: "top",
    Bottom: "bottom"
  }
}));

const { renderHook } = nodeStoreRenderers(
  makeNodeStore({
    // Getters, so each render reads whatever the current test assigned.
    get nodes() {
      return mockNodes;
    },
    get setNodes() {
      return mockSetNodes;
    },
    getSelectedNodes: () => mockSelectedNodes
  })
);
const createMockNode = (
  id: string,
  x: number,
  y: number,
  width?: number,
  height?: number
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
  measured: width ? { width, height: height || 50 } : undefined
});

describe("useAlignNodes", () => {

  beforeEach(() => {
    mockSetNodes = jest.fn();
    mockNodes = [];
    mockSelectedNodes = [];
    jest.clearAllMocks();
  });

  it("returns a function", () => {
    const { result } = renderHook(() => useAlignNodes());
    expect(typeof result.current).toBe("function");
  });

  it("does nothing with less than 2 selected nodes", () => {
    const singleNode = createMockNode("node1", 0, 0);
    mockNodes = [singleNode];
    mockSelectedNodes = [singleNode];

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(mockSetNodes).not.toHaveBeenCalled();
  });

  it("aligns nodes vertically when xRange < yRange", () => {
    const selectedNodes = [
      createMockNode("node1", 100, 0),
      createMockNode("node2", 150, 100),
      createMockNode("node3", 50, 200)
    ];
    mockNodes = selectedNodes;
    mockSelectedNodes = selectedNodes;

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(mockSetNodes).toHaveBeenCalled();
    // Verify all nodes have the same x position (aligned left)
    const updatedNodes = mockSetNodes.mock.calls[0][0];
    const updatedX = updatedNodes.map((n: Node) => n.position.x);
    expect(new Set(updatedX).size).toBe(1);
  });

  it("aligns nodes horizontally when xRange >= yRange", () => {
    const selectedNodes = [
      createMockNode("node1", 0, 100),
      createMockNode("node2", 100, 150),
      createMockNode("node3", 200, 50)
    ];
    mockNodes = selectedNodes;
    mockSelectedNodes = selectedNodes;

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(mockSetNodes).toHaveBeenCalled();
    // Verify all nodes have the same y position (aligned top)
    const updatedNodes = mockSetNodes.mock.calls[0][0];
    const updatedY = updatedNodes.map((n: Node) => n.position.y);
    expect(new Set(updatedY).size).toBe(1);
  });

  it("applies spacing when arrangeSpacing is true (vertical alignment)", () => {
    const selectedNodes = [
      createMockNode("node1", 100, 0, 100, 50),
      createMockNode("node2", 150, 200, 100, 50),
      createMockNode("node3", 50, 400, 100, 50)
    ];
    mockNodes = selectedNodes;
    mockSelectedNodes = selectedNodes;

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: true });
    });

    expect(mockSetNodes).toHaveBeenCalled();
    const updatedNodes = mockSetNodes.mock.calls[0][0];
    const updatedPositions = updatedNodes.map((n: Node) => n.position);
    expect(updatedPositions[1].y).toBeGreaterThan(updatedPositions[0].y);
  });

  it("sets collapsed state when provided", () => {
    const selectedNodes = [
      createMockNode("node1", 0, 0),
      createMockNode("node2", 100, 0)
    ];
    mockNodes = selectedNodes;
    mockSelectedNodes = selectedNodes;

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false, collapsed: true });
    });

    expect(mockSetNodes).toHaveBeenCalled();
    const updatedNodes = mockSetNodes.mock.calls[0][0];
    expect(updatedNodes[0].data.collapsed).toBe(true);
    expect(updatedNodes[1].data.collapsed).toBe(true);
  });

  it("maintains original positions for non-selected nodes", () => {
    const selectedNodes = [
      createMockNode("node1", 0, 0),
      createMockNode("node2", 100, 0)
    ];
    const unrelatedNode = createMockNode("unrelated", 500, 500);
    mockNodes = [...selectedNodes, unrelatedNode];
    mockSelectedNodes = selectedNodes;

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(mockSetNodes).toHaveBeenCalled();
    const updatedNodes = mockSetNodes.mock.calls[0][0];
    const updatedUnrelated = updatedNodes.find((n: Node) => n.id === "unrelated");
    expect(updatedUnrelated?.position).toEqual({ x: 500, y: 500 });
  });

  it("handles nodes without measured dimensions", () => {
    const selectedNodes = [
      createMockNode("node1", 0, 0),
      createMockNode("node2", 100, 0)
    ];
    mockNodes = selectedNodes;
    mockSelectedNodes = selectedNodes;

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: true });
    });

    expect(mockSetNodes).toHaveBeenCalled();
  });
});
