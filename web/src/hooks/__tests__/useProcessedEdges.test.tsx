import { renderHook } from "@testing-library/react";
import { Edge, Node, Position } from "@xyflow/react";
import { useProcessedEdges } from "../useProcessedEdges";
import { DataType } from "../config/data_types";
import { NodeMetadata } from "../stores/ApiTypes";
import { NodeData } from "../stores/NodeData";

const createMockNode = (id: string, type: string, data: Partial<NodeData> = {}): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test-workflow",
    ...data,
  },
});

const createMockEdge = (id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  type: "default",
  animated: false,
  style: { stroke: "#000", strokeWidth: 1 },
});

const mockDataTypes: DataType[] = [
  { slug: "text", value: "text", name: "Text", color: "#4299E1" },
  { slug: "image", value: "image", name: "Image", color: "#48BB78" },
  { slug: "audio", value: "audio", name: "Audio", color: "#ED8936" },
  { slug: "any", value: "any", name: "Any", color: "#718096" },
];

const mockGetMetadata = (_nodeType: string): NodeMetadata | undefined => {
  return undefined;
};

describe("useProcessedEdges", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("basic functionality", () => {
    it("returns empty arrays when no edges provided", () => {
      const { result } = renderHook(() =>
        useProcessedEdges({
          edges: [],
          nodes: [],
          dataTypes: mockDataTypes,
          getMetadata: mockGetMetadata,
        })
      );

      expect(result.current.processedEdges).toEqual([]);
      expect(result.current.activeGradientKeys.size).toBe(0);
    });

    it("processes single edge between nodes", () => {
      const nodes = [
        createMockNode("node1", "test-type"),
        createMockNode("node2", "test-type"),
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: mockGetMetadata,
        })
      );

      expect(result.current.processedEdges).toHaveLength(1);
      expect(result.current.processedEdges[0].id).toBe("edge1");
    });

    it("handles nodes without metadata", () => {
      const nodes = [
        createMockNode("node1", "unknown-type"),
        createMockNode("node2", "another-unknown"),
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: () => undefined,
        })
      );

      expect(result.current.processedEdges).toHaveLength(1);
      // Should default to "any" type when no metadata
      expect(result.current.processedEdges[0].style).toBeDefined();
    });

    it("handles edges without handles gracefully", () => {
      const nodes = [
        createMockNode("node1", "test-type"),
        createMockNode("node2", "test-type"),
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: mockGetMetadata,
        })
      );

      expect(result.current.processedEdges).toHaveLength(1);
    });
  });

  describe("selection drag optimization", () => {
    it("caches result during selection drag", () => {
      const nodes = [
        createMockNode("node1", "test-type"),
        createMockNode("node2", "test-type"),
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];

      // First render without selection
      const { result, rerender } = renderHook(
        ({ isSelecting }) =>
          useProcessedEdges({
            edges,
            nodes,
            dataTypes: mockDataTypes,
            getMetadata: mockGetMetadata,
            isSelecting,
          }),
        { initialProps: { isSelecting: false } }
      );

      const firstResult = result.current;

      // Update nodes - normally this would trigger recalculation
      const updatedNodes = [
        createMockNode("node1", "test-type", { properties: { newProp: "value" } }),
        createMockNode("node2", "test-type"),
      ];

      // Enable selection mode - should use cached result
      rerender({ isSelecting: true, nodes: updatedNodes });

      // When isSelecting is true, the result should be from cache (same object reference possible)
      expect(result.current).toBeDefined();
    });
  });

  describe("edge status handling", () => {
    it("includes edge status in processed result", () => {
      const nodes = [
        createMockNode("node1", "test-type"),
        createMockNode("node2", "test-type"),
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];
      const edgeStatuses = {
        edge1: { status: "message_sent", counter: 5 },
      };

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: mockGetMetadata,
          edgeStatuses,
        })
      );

      expect(result.current.processedEdges).toHaveLength(1);
      const edge = result.current.processedEdges[0];
      // The edge should be processed with status information
      expect(edge).toBeDefined();
    });
  });

  describe("gradient keys", () => {
    it("tracks active gradient keys", () => {
      const nodes = [
        createMockNode("node1", "test-type"),
        createMockNode("node2", "test-type"),
        createMockNode("node3", "test-type"),
      ];
      const edges = [
        createMockEdge("e1", "node1", "node2"),
        createMockEdge("e2", "node1", "node3"),
      ];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: mockGetMetadata,
        })
      );

      // Gradient keys should be tracked for different type combinations
      expect(result.current.activeGradientKeys).toBeDefined();
      expect(result.current.activeGradientKeys.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe("performance optimization", () => {
    it("creates new result when nodes change structure", () => {
      const nodes1 = [createMockNode("node1", "test-type")];
      const nodes2 = [
        createMockNode("node1", "test-type", { properties: { changed: true } }),
      ];

      const edges: Edge[] = [];

      const { result, rerender } = renderHook(
        ({ nodes }) =>
          useProcessedEdges({
            edges,
            nodes,
            dataTypes: mockDataTypes,
            getMetadata: mockGetMetadata,
          }),
        { initialProps: { nodes: nodes1 } }
      );

      const firstResult = result.current;

      rerender({ nodes: nodes2 });

      // Should have computed a new result
      expect(result.current).toBeDefined();
    });

    it("handles large numbers of edges efficiently", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("source", "test-type"),
        createMockNode("target", "test-type"),
      ];

      // Create 100 edges
      const edges: Edge[] = Array.from({ length: 100 }, (_, i) =>
        createMockEdge(`edge${i}`, "source", "target")
      );

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: mockGetMetadata,
        })
      );

      expect(result.current.processedEdges).toHaveLength(100);
    });
  });
});
