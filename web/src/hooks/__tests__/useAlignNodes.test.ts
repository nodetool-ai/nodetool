import { renderHook, act } from "@testing-library/react";
import useAlignNodes from "../useAlignNodes";
import { Node, Position } from "@xyflow/react";

const mockSetNodes = jest.fn();

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    setNodes: mockSetNodes
  })),
  Position: {
    Left: "left",
    Right: "right",
    Top: "top",
    Bottom: "bottom"
  }
}));

const mockGetSelectedNodes = jest.fn();

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) => {
    const mockState = {
      getSelectedNodes: mockGetSelectedNodes
    };
    return selector(mockState);
  })
}));

interface MockNodeData extends Record<string, unknown> {
  properties: Record<string, unknown>;
  dynamic_properties: Record<string, unknown>;
  dynamic_outputs?: Record<string, { type: string }>;
  selectable: boolean;
  workflow_id: string;
  collapsed?: boolean;
  bypassed?: boolean;
}

const createMockNode = (
  id: string,
  x: number,
  y: number,
  width?: number,
  height?: number
): Node<MockNodeData> => ({
  id,
  type: "test",
  position: { x, y },
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  data: {
    properties: {},
    dynamic_properties: {},
    dynamic_outputs: {},
    selectable: true,
    workflow_id: "test-workflow"
  },
  measured: width ? { width, height: height || 50 } : undefined
});

describe("useAlignNodes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSelectedNodes.mockReturnValue([]);
  });

  it("returns a function", () => {
    const { result } = renderHook(() => useAlignNodes());
    expect(typeof result.current).toBe("function");
  });

  it("does nothing with less than 2 selected nodes", () => {
    mockGetSelectedNodes.mockReturnValue([createMockNode("node1", 0, 0)]);

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(mockSetNodes).not.toHaveBeenCalled();
  });

  it("aligns nodes vertically when xRange < yRange", () => {
    mockGetSelectedNodes.mockReturnValue([
      createMockNode("node1", 100, 0),
      createMockNode("node2", 150, 100),
      createMockNode("node3", 50, 200)
    ]);

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(mockSetNodes).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = mockSetNodes.mock.calls[0][0];
    const currentNodes = [
      createMockNode("node1", 100, 0),
      createMockNode("node2", 150, 100),
      createMockNode("node3", 50, 200)
    ];
    const updatedNodes = updateFunction(currentNodes);
    const updatedX = updatedNodes.map((n: Node) => n.position.x);
    expect(new Set(updatedX).size).toBe(1);
  });

  it("aligns nodes horizontally when xRange >= yRange", () => {
    mockGetSelectedNodes.mockReturnValue([
      createMockNode("node1", 0, 100),
      createMockNode("node2", 100, 150),
      createMockNode("node3", 200, 50)
    ]);

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(mockSetNodes).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = mockSetNodes.mock.calls[0][0];
    const currentNodes = [
      createMockNode("node1", 0, 100),
      createMockNode("node2", 100, 150),
      createMockNode("node3", 200, 50)
    ];
    const updatedNodes = updateFunction(currentNodes);
    const updatedY = updatedNodes.map((n: Node) => n.position.y);
    expect(new Set(updatedY).size).toBe(1);
  });

  it("applies spacing when arrangeSpacing is true (vertical alignment)", () => {
    mockGetSelectedNodes.mockReturnValue([
      createMockNode("node1", 100, 0, 100, 50),
      createMockNode("node2", 150, 200, 100, 50),
      createMockNode("node3", 50, 400, 100, 50)
    ]);

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: true });
    });

    expect(mockSetNodes).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = mockSetNodes.mock.calls[0][0];
    const currentNodes = [
      createMockNode("node1", 100, 0, 100, 50),
      createMockNode("node2", 150, 200, 100, 50),
      createMockNode("node3", 50, 400, 100, 50)
    ];
    const updatedNodes = updateFunction(currentNodes);
    const updatedPositions = updatedNodes.map((n: Node) => n.position);
    expect(updatedPositions[1].y).toBeGreaterThan(updatedPositions[0].y);
  });

  it("sets collapsed state when provided", () => {
    mockGetSelectedNodes.mockReturnValue([
      createMockNode("node1", 0, 0),
      createMockNode("node2", 100, 0)
    ]);

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false, collapsed: true });
    });

    expect(mockSetNodes).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = mockSetNodes.mock.calls[0][0];
    const currentNodes = [
      createMockNode("node1", 0, 0),
      createMockNode("node2", 100, 0)
    ];
    const updatedNodes = updateFunction(currentNodes);
    expect(updatedNodes[0].data.collapsed).toBe(true);
    expect(updatedNodes[1].data.collapsed).toBe(true);
  });

  it("maintains original positions for non-selected nodes", () => {
    const selectedNodes = [
      createMockNode("node1", 0, 0),
      createMockNode("node2", 100, 0)
    ];
    mockGetSelectedNodes.mockReturnValue(selectedNodes);

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(mockSetNodes).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = mockSetNodes.mock.calls[0][0];
    const currentNodes = [
      ...selectedNodes,
      createMockNode("unrelated", 500, 500)
    ];
    const updatedNodes = updateFunction(currentNodes);
    const unrelatedNode = updatedNodes.find((n: Node) => n.id === "unrelated");
    expect(unrelatedNode?.position).toEqual({ x: 500, y: 500 });
  });

  it("handles nodes without measured dimensions", () => {
    mockGetSelectedNodes.mockReturnValue([
      createMockNode("node1", 0, 0),
      createMockNode("node2", 100, 0)
    ]);

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: true });
    });

    expect(mockSetNodes).toHaveBeenCalled();
  });
});
