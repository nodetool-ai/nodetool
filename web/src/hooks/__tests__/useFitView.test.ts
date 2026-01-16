import { renderHook, act } from "@testing-library/react";
import { useFitView } from "../useFitView";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { Position } from "@xyflow/system";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn()
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";

const mockUseReactFlow = useReactFlow as jest.Mock;
const mockUseNodes = useNodes as jest.Mock;

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
    mockUseReactFlow.mockReturnValue({
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
    mockUseNodes.mockReturnValue({
      nodes: [createMockNode("node1", 0, 0, 100, 50)],
      getSelectedNodes: jest.fn(() => []),
      setSelectedNodes: jest.fn(),
      setViewport: jest.fn()
    });

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current();
    });

    expect(fitView).toHaveBeenCalledWith({ duration: 800, padding: 0.1 });
  });

  it("fits selected nodes when nodes are selected", () => {
    mockUseNodes.mockReturnValue({
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
    });

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current();
    });

    expect(fitBounds).toHaveBeenCalled();
  });

  it("fits specific node IDs when provided", () => {
    mockUseNodes.mockReturnValue({
      nodes: [
        createMockNode("node1", 0, 0, 100, 50),
        createMockNode("node2", 200, 0, 100, 50),
        createMockNode("node3", 400, 0, 100, 50)
      ],
      getSelectedNodes: jest.fn(() => []),
      setSelectedNodes: jest.fn(),
      setViewport: jest.fn()
    });

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current({ nodeIds: ["node1", "node3"] });
    });

    expect(fitBounds).toHaveBeenCalled();
  });

  it("uses custom padding when provided", () => {
    mockUseNodes.mockReturnValue({
      nodes: [createMockNode("node1", 0, 0, 100, 50)],
      getSelectedNodes: jest.fn(() => []),
      setSelectedNodes: jest.fn(),
      setViewport: jest.fn()
    });

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current({ padding: 0.5 });
    });

    expect(fitView).toHaveBeenCalledWith({ duration: 800, padding: 0.5 });
  });

  it("applies extra left padding to bounds", () => {
    const nodes = [
      createMockNode("node1", 100, 100, 100, 50),
      createMockNode("node2", 300, 100, 100, 50)
    ];
    mockUseNodes.mockReturnValue({
      nodes,
      getSelectedNodes: jest.fn(() => nodes),
      setSelectedNodes: jest.fn(),
      setViewport: jest.fn()
    });

    const { result } = renderHook(() => useFitView());

    act(() => {
      result.current();
    });

    expect(fitBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        x: expect.any(Number)
      }),
      expect.any(Object)
    );
  });
});
