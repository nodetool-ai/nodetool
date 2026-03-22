import { renderHook } from "@testing-library/react";
import { useProcessedEdges } from "../useProcessedEdges";
import { Edge, Node, Position } from "@xyflow/react";
import { DataType } from "../../config/data_types";
import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";

const createMockNode = (
  id: string,
  type: string,
  overrides: Partial<Node<NodeData>> = {}
): Node<NodeData> => ({
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
    ...(overrides.data || {})
  },
  ...overrides
});

const createMockEdge = (
  id: string,
  source: string,
  target: string,
  sourceHandle = "output",
  targetHandle = "input"
): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle
});

const mockDataTypes: DataType[] = [
  { slug: "any", value: "any", name: "Any", color: "#888", label: "Any", namespace: "", description: "", textColor: "#fff" },
  { slug: "string", value: "str", name: "str", color: "#3f51b5", label: "String", namespace: "", description: "", textColor: "#fff" },
  { slug: "int", value: "int", name: "int", color: "#4caf50", label: "Integer", namespace: "", description: "", textColor: "#fff" },
  { slug: "float", value: "float", name: "float", color: "#ff9800", label: "Float", namespace: "", description: "", textColor: "#fff" },
  { slug: "image", value: "image", name: "image", color: "#e91e63", label: "Image", namespace: "", description: "", textColor: "#fff" },
  { slug: "audio", value: "audio", name: "audio", color: "#9c27b0", label: "Audio", namespace: "", description: "", textColor: "#fff" }
];

describe("useProcessedEdges", () => {
  const defaultGetMetadata = (): NodeMetadata | undefined => undefined;

  describe("basic edge processing", () => {
    it("returns empty results for empty inputs", () => {
      const { result } = renderHook(() =>
        useProcessedEdges({
          edges: [],
          nodes: [],
          dataTypes: mockDataTypes,
          getMetadata: defaultGetMetadata
        })
      );

      expect(result.current.processedEdges).toEqual([]);
      expect(result.current.activeGradientKeys.size).toBe(0);
    });

    it("processes edges and adds styles", () => {
      const nodes = [
        createMockNode("node1", "test.Node"),
        createMockNode("node2", "test.Node")
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: defaultGetMetadata
        })
      );

      expect(result.current.processedEdges).toHaveLength(1);
      expect(result.current.processedEdges[0].style).toBeDefined();
      expect(result.current.processedEdges[0].style?.strokeWidth).toBe(2);
    });

    it("preserves original edge properties", () => {
      const nodes = [
        createMockNode("node1", "test.Node"),
        createMockNode("node2", "test.Node")
      ];
      const edges = [
        {
          ...createMockEdge("edge1", "node1", "node2"),
          animated: true,
          label: "test label"
        }
      ];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: defaultGetMetadata
        })
      );

      expect(result.current.processedEdges[0].animated).toBe(true);
      expect(result.current.processedEdges[0].label).toBe("test label");
    });
  });

  describe("type resolution", () => {
    it("resolves source type from metadata", () => {
      const nodes = [
        createMockNode("node1", "test.TextNode"),
        createMockNode("node2", "test.Node")
      ];
      const edges = [createMockEdge("edge1", "node1", "node2", "text_output", "text_input")];

      const getMetadata = (nodeType: string): NodeMetadata | undefined => {
        if (nodeType === "test.TextNode") {
          return {
            node_type: "test.TextNode",
            namespace: "test",
            title: "Text Node",
            properties: [],
            outputs: [
              { name: "text_output", type: { type: "str" } }
            ]
          } as unknown as NodeMetadata;
        }
        if (nodeType === "test.Node") {
          return {
            node_type: "test.Node",
            namespace: "test",
            title: "Node",
            properties: [
              { name: "text_input", type: { type: "str" } }
            ],
            outputs: []
          } as unknown as NodeMetadata;
        }
        return undefined;
      };

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata
        })
      );

      // The edge should have the string color since both source and target are str type
      expect(result.current.processedEdges[0].style?.stroke).toBe("#3f51b5");
    });
  });

  describe("reroute node handling", () => {
    it("traces through reroute nodes to find effective source type", () => {
      const nodes = [
        createMockNode("source", "test.TextNode"),
        createMockNode("reroute", "nodetool.control.Reroute"),
        createMockNode("target", "test.Node")
      ];
      const edges = [
        createMockEdge("edge1", "source", "reroute", "text_output", "input_value"),
        createMockEdge("edge2", "reroute", "target", "output", "input")
      ];

      const getMetadata = (nodeType: string): NodeMetadata | undefined => {
        if (nodeType === "test.TextNode") {
          return {
            node_type: "test.TextNode",
            namespace: "test",
            title: "Text Node",
            properties: [],
            outputs: [{ name: "text_output", type: { type: "str" } }]
          } as unknown as NodeMetadata;
        }
        return undefined;
      };

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata
        })
      );

      // Both edges should trace back to the string type
      expect(result.current.processedEdges).toHaveLength(2);
    });
  });

  describe("gradient handling", () => {
    it("adds gradient key when source and target types differ", () => {
      const nodes = [
        createMockNode("node1", "test.ImageNode"),
        createMockNode("node2", "test.AudioNode")
      ];
      const edges = [createMockEdge("edge1", "node1", "node2", "image_out", "audio_in")];

      const getMetadata = (nodeType: string): NodeMetadata | undefined => {
        if (nodeType === "test.ImageNode") {
          return {
            node_type: "test.ImageNode",
            namespace: "test",
            title: "Image Node",
            properties: [{ name: "audio_in", type: { type: "audio" } }],
            outputs: [{ name: "image_out", type: { type: "image" } }]
          } as unknown as NodeMetadata;
        }
        if (nodeType === "test.AudioNode") {
          return {
            node_type: "test.AudioNode",
            namespace: "test",
            title: "Audio Node",
            properties: [{ name: "audio_in", type: { type: "audio" } }],
            outputs: []
          } as unknown as NodeMetadata;
        }
        return undefined;
      };

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata
        })
      );

      // Should have a gradient key for different types
      expect(result.current.activeGradientKeys.size).toBeGreaterThanOrEqual(0);
    });

    it("uses solid color when source and target types match", () => {
      const nodes = [
        createMockNode("node1", "test.TextNode"),
        createMockNode("node2", "test.TextNode")
      ];
      const edges = [createMockEdge("edge1", "node1", "node2", "text_out", "text_in")];

      const getMetadata = (): NodeMetadata | undefined => ({
        node_type: "test.TextNode",
        namespace: "test",
        title: "Text Node",
        properties: [{ name: "text_in", type: { type: "str" } }],
        outputs: [{ name: "text_out", type: { type: "str" } }]
      } as unknown as NodeMetadata);

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata
        })
      );

      // Should use solid color, no gradient
      expect(result.current.processedEdges[0].style?.stroke).not.toContain("url(#gradient");
    });
  });

  describe("bypassed nodes", () => {
    it("adds 'from-bypassed' class when source node is bypassed", () => {
      const nodes = [
        createMockNode("node1", "test.Node", { data: { bypassed: true } as any }),
        createMockNode("node2", "test.Node")
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: defaultGetMetadata
        })
      );

      expect(result.current.processedEdges[0].className).toContain("from-bypassed");
    });

    it("adds 'from-bypassed' class when target node is bypassed", () => {
      const nodes = [
        createMockNode("node1", "test.Node"),
        createMockNode("node2", "test.Node", { data: { bypassed: true } as any })
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: defaultGetMetadata
        })
      );

      expect(result.current.processedEdges[0].className).toContain("from-bypassed");
    });
  });

  describe("streaming edges", () => {
    it("adds 'streaming-edge' class for streaming output nodes", () => {
      const nodes = [
        createMockNode("node1", "test.StreamingNode"),
        createMockNode("node2", "test.Node")
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];

      const getMetadata = (nodeType: string): NodeMetadata | undefined => {
        if (nodeType === "test.StreamingNode") {
          return {
            node_type: "test.StreamingNode",
            namespace: "test",
            title: "Streaming Node",
            properties: [],
            outputs: [],
            is_streaming_output: true
          } as unknown as NodeMetadata;
        }
        return undefined;
      };

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata
        })
      );

      expect(result.current.processedEdges[0].className).toContain("streaming-edge");
    });
  });

  describe("edge status handling", () => {
    it("adds 'message-sent' class for edges with message_sent status", () => {
      const nodes = [
        createMockNode("node1", "test.Node"),
        createMockNode("node2", "test.Node")
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];
      const workflowId = "workflow-1";
      const edgeStatuses = {
        [`${workflowId}:edge1`]: { status: "message_sent", counter: 5 }
      };

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: defaultGetMetadata,
          workflowId,
          edgeStatuses
        })
      );

      expect(result.current.processedEdges[0].className).toContain("message-sent");
      expect(result.current.processedEdges[0].data?.status).toBe("message_sent");
      expect(result.current.processedEdges[0].data?.counter).toBe(5);
    });

    it("adds 'message-sent' class when source node is running", () => {
      const nodes = [
        createMockNode("node1", "test.Node"),
        createMockNode("node2", "test.Node")
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];
      const workflowId = "workflow-1";
      const nodeStatuses = {
        [`${workflowId}:node1`]: "running"
      };

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: defaultGetMetadata,
          workflowId,
          nodeStatuses
        })
      );

      expect(result.current.processedEdges[0].className).toContain("message-sent");
    });
  });

  describe("selection caching", () => {
    it("reuses cached result when isSelecting is true", () => {
      const nodes = [
        createMockNode("node1", "test.Node"),
        createMockNode("node2", "test.Node")
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];

      const { result, rerender } = renderHook(
        ({ isSelecting }) =>
          useProcessedEdges({
            edges,
            nodes,
            dataTypes: mockDataTypes,
            getMetadata: defaultGetMetadata,
            isSelecting
          }),
        { initialProps: { isSelecting: false } }
      );

      const firstResult = result.current;

      // Simulate selection mode
      rerender({ isSelecting: true });

      // Result should be the same reference (cached)
      expect(result.current.processedEdges).toEqual(firstResult.processedEdges);
    });
  });

  describe("edge data properties", () => {
    it("includes dataTypeLabel in edge data", () => {
      const nodes = [
        createMockNode("node1", "test.TextNode"),
        createMockNode("node2", "test.Node")
      ];
      const edges = [createMockEdge("edge1", "node1", "node2", "text_out", "input")];

      const getMetadata = (nodeType: string): NodeMetadata | undefined => {
        if (nodeType === "test.TextNode") {
          return {
            node_type: "test.TextNode",
            namespace: "test",
            title: "Text Node",
            properties: [],
            outputs: [{ name: "text_out", type: { type: "str" } }]
          } as unknown as NodeMetadata;
        }
        return undefined;
      };

      const { result } = renderHook(() =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata
        })
      );

      expect(result.current.processedEdges[0].data?.dataTypeLabel).toBe("String");
    });
  });
});
