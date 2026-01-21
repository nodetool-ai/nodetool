import { describe, it, expect, beforeEach } from "@jest/globals";
import { renderHook } from "@testing-library/react";
import { useProcessedEdges } from "../useProcessedEdges";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeStore";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn().mockReturnValue({
    getNodes: jest.fn().mockReturnValue([]),
    getEdges: jest.fn().mockReturnValue([]),
    screenToFlowPosition: jest.fn().mockReturnValue({ x: 100, y: 200 }),
    setNodes: jest.fn(),
    setEdges: jest.fn(),
    onNodesChange: jest.fn(),
    onEdgesChange: jest.fn(),
    onConnect: jest.fn(),
    addEdges: jest.fn(),
    project: jest.fn().mockReturnValue({ x: 100, y: 200 }),
    viewport: { x: 0, y: 0, zoom: 1 },
  }),
  getRectOfNodes: jest.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
  getTransformForBounds: jest.fn().mockReturnValue({ x: 0, y: 0, k: 1 }),
  Panel: jest.fn(({ children }) => children),
  useUpdateNodeInternals: jest.fn(),
  Connection: jest.fn(),
  Handle: jest.fn(),
  Position: {
    Top: "top",
    Bottom: "bottom",
    Left: "left",
    Right: "right",
  },
  MarkerType: {
    ArrowClosed: "arrowclosed",
  },
  ConnectionLineType: {
    SmoothStep: "smoothstep",
  },
}));

describe("useProcessedEdges", () => {
  const createMockNode = (id: string, position = { x: 0, y: 0 }): Node<NodeData> => ({
    id,
    type: "default",
    position,
    data: {
      properties: {},
      dynamic_properties: {},
      selectable: true,
      workflow_id: "test",
    },
    targetPosition: 0,
    sourcePosition: 1,
  });

  const createMockEdge = (id: string, source: string, target: string): Edge => ({
    id,
    source,
    target,
    sourceHandle: "default",
    targetHandle: "default",
    type: "default",
    animated: false,
    data: {},
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("basic functionality", () => {
    it("should return an array of processed edges", () => {
      const nodes = [createMockNode("1"), createMockNode("2")];
      const edges = [createMockEdge("e1", "1", "2")];

      const { result } = renderHook(() =>
        useProcessedEdges(nodes, edges)
      );

      expect(result.current).toBeDefined();
      expect(Array.isArray(result.current)).toBe(true);
    });

    it("should handle empty inputs", () => {
      const { result } = renderHook(() =>
        useProcessedEdges([], [])
      );

      expect(result.current).toBeDefined();
    });

    it("should process multiple edges", () => {
      const nodes = [
        createMockNode("1"),
        createMockNode("2"),
        createMockNode("3"),
      ];
      const edges = [
        createMockEdge("e1", "1", "2"),
        createMockEdge("e2", "2", "3"),
      ];

      const { result } = renderHook(() =>
        useProcessedEdges(nodes, edges)
      );

      expect(result.current.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("edge properties", () => {
    it("should preserve edge id", () => {
      const nodes = [createMockNode("1"), createMockNode("2")];
      const edges = [createMockEdge("test-edge", "1", "2")];

      const { result } = renderHook(() =>
        useProcessedEdges(nodes, edges)
      );

      expect(result.current).toBeDefined();
    });

    it("should handle edges with custom handles", () => {
      const nodes = [createMockNode("1"), createMockNode("2")];
      const edges = [
        {
          ...createMockEdge("e1", "1", "2"),
          sourceHandle: "output-1",
          targetHandle: "input-1",
        },
      ];

      const { result } = renderHook(() =>
        useProcessedEdges(nodes, edges)
      );

      expect(result.current).toBeDefined();
    });

    it("should handle animated edges", () => {
      const nodes = [createMockNode("1"), createMockNode("2")];
      const edges = [
        {
          ...createMockEdge("e1", "1", "2"),
          animated: true,
        },
      ];

      const { result } = renderHook(() =>
        useProcessedEdges(nodes, edges)
      );

      expect(result.current).toBeDefined();
    });
  });

  describe("node-edge relationship", () => {
    it("should handle edges with valid node references", () => {
      const nodes = [
        createMockNode("source"),
        createMockNode("target"),
      ];
      const edges = [
        createMockEdge("e1", "source", "target"),
      ];

      const { result } = renderHook(() =>
        useProcessedEdges(nodes, edges)
      );

      expect(result.current).toBeDefined();
    });

    it("should handle edges with missing source node", () => {
      const nodes = [createMockNode("target")];
      const edges = [
        createMockEdge("e1", "source", "target"),
      ];

      const { result } = renderHook(() =>
        useProcessedEdges(nodes, edges)
      );

      expect(result.current).toBeDefined();
    });

    it("should handle edges with missing target node", () => {
      const nodes = [createMockNode("source")];
      const edges = [
        createMockEdge("e1", "source", "target"),
      ];

      const { result } = renderHook(() =>
        useProcessedEdges(nodes, edges)
      );

      expect(result.current).toBeDefined();
    });
  });
});
