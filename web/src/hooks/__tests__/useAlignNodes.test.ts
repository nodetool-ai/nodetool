import { renderHook, act } from "@testing-library/react";
import useAlignNodes from "../useAlignNodes";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

const mockSetNodes = jest.fn();

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
  height?: number
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
  measured: width ? { width, height: height || 50 } : undefined
});

describe("useAlignNodes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetNodes.mockReset();
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        getSelectedNodes: jest.fn(() => [])
      })
    );
    (useReactFlow as unknown as jest.Mock).mockReturnValue({
      setNodes: mockSetNodes
    });
  });

  it("returns a function", () => {
    const { result } = renderHook(() => useAlignNodes());
    expect(typeof result.current).toBe("function");
  });

  it("does nothing with less than 2 selected nodes", () => {
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        getSelectedNodes: jest.fn(() => [createMockNode("node1", 0, 0)])
      })
    );

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: false });
    });

    expect(mockSetNodes).not.toHaveBeenCalled();
  });

  it("aligns nodes vertically when xRange < yRange", () => {
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        getSelectedNodes: jest.fn(() => [
          createMockNode("node1", 100, 0),
          createMockNode("node2", 150, 100),
          createMockNode("node3", 50, 200)
        ])
      })
    );

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
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        getSelectedNodes: jest.fn(() => [
          createMockNode("node1", 0, 100),
          createMockNode("node2", 100, 150),
          createMockNode("node3", 200, 50)
        ])
      })
    );

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
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        getSelectedNodes: jest.fn(() => [
          createMockNode("node1", 100, 0, 100, 50),
          createMockNode("node2", 150, 200, 100, 50),
          createMockNode("node3", 50, 400, 100, 50)
        ])
      })
    );

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
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        getSelectedNodes: jest.fn(() => [
          createMockNode("node1", 0, 0),
          createMockNode("node2", 100, 0)
        ])
      })
    );

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
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        getSelectedNodes: jest.fn(() => selectedNodes)
      })
    );

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
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        getSelectedNodes: jest.fn(() => [
          createMockNode("node1", 0, 0),
          createMockNode("node2", 100, 0)
        ])
      })
    );

    const { result } = renderHook(() => useAlignNodes());

    act(() => {
      result.current({ arrangeSpacing: true });
    });

    expect(mockSetNodes).toHaveBeenCalled();
  });
});
