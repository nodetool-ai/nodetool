import { renderHook, act } from "@testing-library/react";
import useAlignNodes from "../useAlignNodes";
import { Node, Position, useReactFlow } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    setNodes: jest.fn()
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
      getSelectedNodes: jest.fn(() => [])
    };
    return selector(mockState);
  })
}));

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
  let setNodes: jest.Mock;
  const mockUseReactFlow = jest.mocked(useReactFlow);
  const mockUseNodes = jest.mocked(useNodes);

  beforeEach(() => {
    setNodes = jest.fn();
    mockUseReactFlow.mockReturnValue({
      setNodes
    } as any);
    jest.clearAllMocks();
  });

  it("returns a function", () => {
    const { result } = renderHook(() => useAlignNodes());
    expect(typeof result.current).toBe("function");
  });

  it("does nothing with less than 2 selected nodes", () => {
    mockUseNodes.mockImplementation((selector) => {
      return selector({
        getSelectedNodes: jest.fn(() => [createMockNode("node1", 0, 0)])
      } as any);
    });

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(setNodes).not.toHaveBeenCalled();
  });

  it("aligns nodes vertically when xRange < yRange", () => {
    mockUseNodes.mockImplementation((selector) => {
      return selector({
        getSelectedNodes: jest.fn(() => [
          createMockNode("node1", 100, 0),
          createMockNode("node2", 150, 100),
          createMockNode("node3", 50, 200)
        ])
      } as any);
    });

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(setNodes).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = setNodes.mock.calls[0][0];
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
    mockUseNodes.mockImplementation((selector) => {
      return selector({
        getSelectedNodes: jest.fn(() => [
          createMockNode("node1", 0, 100),
          createMockNode("node2", 100, 150),
          createMockNode("node3", 200, 50)
        ])
      } as any);
    });

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(setNodes).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = setNodes.mock.calls[0][0];
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
    mockUseNodes.mockImplementation((selector) => {
      return selector({
        getSelectedNodes: jest.fn(() => [
          createMockNode("node1", 100, 0, 100, 50),
          createMockNode("node2", 150, 200, 100, 50),
          createMockNode("node3", 50, 400, 100, 50)
        ])
      } as any);
    });

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: true });
    });

    expect(setNodes).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = setNodes.mock.calls[0][0];
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
    mockUseNodes.mockImplementation((selector) => {
      return selector({
        getSelectedNodes: jest.fn(() => [
          createMockNode("node1", 0, 0),
          createMockNode("node2", 100, 0)
        ])
      } as any);
    });

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false, collapsed: true });
    });

    expect(setNodes).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = setNodes.mock.calls[0][0];
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
    mockUseNodes.mockImplementation((selector) => {
      return selector({
        getSelectedNodes: jest.fn(() => selectedNodes)
      } as any);
    });

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(setNodes).toHaveBeenCalledWith(expect.any(Function));
    const updateFunction = setNodes.mock.calls[0][0];
    const currentNodes = [
      ...selectedNodes,
      createMockNode("unrelated", 500, 500)
    ];
    const updatedNodes = updateFunction(currentNodes);
    const unrelatedNode = updatedNodes.find((n: Node) => n.id === "unrelated");
    expect(unrelatedNode?.position).toEqual({ x: 500, y: 500 });
  });

  it("handles nodes without measured dimensions", () => {
    mockUseNodes.mockImplementation((selector) => {
      return selector({
        getSelectedNodes: jest.fn(() => [
          createMockNode("node1", 0, 0),
          createMockNode("node2", 100, 0)
        ])
      } as any);
    });

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: true });
    });

    expect(setNodes).toHaveBeenCalled();
  });
});
