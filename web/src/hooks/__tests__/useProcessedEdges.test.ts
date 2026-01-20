import { renderHook } from "@testing-library/react";
import { Edge, Node, Position } from "@xyflow/react";
import { useProcessedEdges } from "../useProcessedEdges";
import { DataType } from "../../config/data_types";
import { NodeData } from "../../stores/NodeData";

const createMockNode = (id: string, type: string = "default"): Node<NodeData> => ({
  id,
  type: type,
  position: { x: 0, y: 0 },
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test",
  },
});

const createMockEdge = (id: string, source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null): Edge => ({
  id,
  source,
  target,
  sourceHandle: sourceHandle ?? undefined,
  targetHandle: targetHandle ?? undefined,
});

const defaultDataTypes: DataType[] = [
  { slug: "any", name: "Any", value: "*", color: "#888", label: "Any", namespace: "default", description: "Any type", textColor: "#fff" },
  { slug: "text", name: "Text", value: "text", color: "#4CAF50", label: "Text", namespace: "default", description: "Text type", textColor: "#fff" },
  { slug: "image", name: "Image", value: "image", color: "#2196F3", label: "Image", namespace: "default", description: "Image type", textColor: "#fff" },
  { slug: "audio", name: "Audio", value: "audio", color: "#9C27B0", label: "Audio", namespace: "default", description: "Audio type", textColor: "#fff" },
];

describe("useProcessedEdges", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("basic edge processing", () => {
    it("returns empty arrays for empty edges", () => {
      const { result } = renderHook(() =>
        useProcessedEdges({
          edges: [],
          nodes: [],
          dataTypes: defaultDataTypes,
          getMetadata: () => undefined,
        })
      );

      expect(result.current.processedEdges).toEqual([]);
      expect(result.current.activeGradientKeys.size).toBe(0);
    });

    it("processes edges with default type when no metadata", () => {
      const edges = [createMockEdge("e1", "node1", "node2")];
      const nodes = [createMockNode("node1"), createMockNode("node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: defaultDataTypes,
          getMetadata: () => undefined,
        })
      );

      expect(result.current.processedEdges).toHaveLength(1);
      expect(result.current.processedEdges[0].id).toBe("e1");
      expect(result.current.processedEdges[0].style?.stroke).toBe("#888");
    });

    it("uses any type when metadata returns undefined", () => {
      const edges = [createMockEdge("e1", "node1", "node2", "output", "input")];
      const nodes = [createMockNode("node1", "custom-type"), createMockNode("node2", "custom-type")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: defaultDataTypes,
          getMetadata: () => undefined,
        })
      );

      expect(result.current.processedEdges[0].className).toContain("any");
    });

    it("processes edge styles correctly", () => {
      const edges = [createMockEdge("e1", "node1", "node2")];
      const nodes = [createMockNode("node1"), createMockNode("node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: defaultDataTypes,
          getMetadata: () => undefined,
        })
      );

      expect(result.current.processedEdges[0].style).toEqual({
        stroke: "#888",
        strokeWidth: 2
      });
    });

    it("adds label when counter is present", () => {
      const edges = [createMockEdge("e1", "node1", "node2")];
      const nodes = [createMockNode("node1"), createMockNode("node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: defaultDataTypes,
          getMetadata: () => undefined,
          workflowId: "workflow-1",
          edgeStatuses: {
            "workflow-1:e1": { status: "message_sent", counter: 5 }
          },
        })
      );

      expect(result.current.processedEdges[0].label).toBe("5");
      expect(result.current.processedEdges[0].className).toContain("message-sent");
    });
  });

  describe("edge status handling", () => {
    it("adds message-sent class when status is message_sent", () => {
      const edges = [createMockEdge("e1", "node1", "node2")];
      const nodes = [createMockNode("node1"), createMockNode("node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: defaultDataTypes,
          getMetadata: () => undefined,
          workflowId: "workflow-1",
          edgeStatuses: {
            "workflow-1:e1": { status: "message_sent", counter: 5 }
          },
        })
      );

      expect(result.current.processedEdges[0].className).toContain("message-sent");
      expect(result.current.processedEdges[0].label).toBe("5");
    });

    it("does not add message-sent class for other statuses", () => {
      const edges = [createMockEdge("e1", "node1", "node2")];
      const nodes = [createMockNode("node1"), createMockNode("node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: defaultDataTypes,
          getMetadata: () => undefined,
          workflowId: "workflow-1",
          edgeStatuses: {
            "workflow-1:e1": { status: "idle", counter: 0 }
          },
        })
      );

      expect(result.current.processedEdges[0].className).not.toContain("message-sent");
    });
  });

  describe("bypass handling", () => {
    it("adds from-bypassed class when source node is bypassed", () => {
      const edges = [createMockEdge("e1", "node1", "node2")];
      const nodes = [
        { ...createMockNode("node1"), data: { ...createMockNode("node1").data, bypassed: true } },
        createMockNode("node2"),
      ];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: defaultDataTypes,
          getMetadata: () => undefined,
        })
      );

      expect(result.current.processedEdges[0].className).toContain("from-bypassed");
    });

    it("adds from-bypassed class when target node is bypassed", () => {
      const edges = [createMockEdge("e1", "node1", "node2")];
      const nodes = [
        createMockNode("node1"),
        { ...createMockNode("node2"), data: { ...createMockNode("node2").data, bypassed: true } },
      ];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: defaultDataTypes,
          getMetadata: () => undefined,
        })
      );

      expect(result.current.processedEdges[0].className).toContain("from-bypassed");
    });
  });

  describe("caching during selection", () => {
    it("caches result during selection drag", () => {
      const edges = [createMockEdge("e1", "node1", "node2")];
      const nodes = [createMockNode("node1"), createMockNode("node2")];

      const { result, rerender } = renderHook(
        ({ isSelecting }) =>
          useProcessedEdges({
            edges,
            nodes,
            dataTypes: defaultDataTypes,
            getMetadata: () => undefined,
            isSelecting,
          }),
        { initialProps: { isSelecting: false } }
      );

      const firstResult = result.current;

      rerender({ isSelecting: true });

      expect(result.current).toBe(firstResult);
    });
  });

  describe("edge label styling", () => {
    it("sets correct label styles", () => {
      const edges = [createMockEdge("e1", "node1", "node2")];
      const nodes = [createMockNode("node1"), createMockNode("node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: defaultDataTypes,
          getMetadata: () => undefined,
          workflowId: "workflow-1",
          edgeStatuses: {
            "workflow-1:e1": { status: "message_sent", counter: 10 }
          },
        })
      );

      expect(result.current.processedEdges[0].labelStyle).toEqual({
        fill: "white",
        fontWeight: 600,
        fontSize: "10px"
      });
      expect(result.current.processedEdges[0].labelBgStyle).toEqual({
        fill: "rgba(0, 0, 0, 0.4)",
        fillOpacity: 1,
        rx: 10,
        ry: 10
      });
    });
  });

  describe("data preservation", () => {
    it("preserves original edge properties", () => {
      const edges = [
        {
          ...createMockEdge("e1", "node1", "node2"),
          animated: true,
          style: { strokeWidth: 3 },
          data: { customField: "customValue" }
        }
      ];
      const nodes = [createMockNode("node1"), createMockNode("node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: defaultDataTypes,
          getMetadata: () => undefined,
        })
      );

      expect(result.current.processedEdges[0].animated).toBe(true);
      expect(result.current.processedEdges[0].data?.customField).toBe("customValue");
    });
  });
});
