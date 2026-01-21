import { renderHook } from "@testing-library/react";
import { useProcessedEdges } from "../useProcessedEdges";
import { Edge, Node, Position } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { DataType } from "../../config/data_types";
import { NodeMetadata } from "../../stores/ApiTypes";

jest.mock("../../utils/handleUtils", () => ({
  findOutputHandle: jest.fn(),
  findInputHandle: jest.fn()
}));

import { findOutputHandle, findInputHandle } from "../../utils/handleUtils";

const createMockNode = (
  id: string,
  type: string = "test",
  position: { x: number; y: number } = { x: 0, y: 0 }
): Node<NodeData> => ({
  id,
  type,
  position,
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test"
  }
});

const createMockEdge = (
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string
): Edge => ({
  id,
  source,
  target,
  sourceHandle: sourceHandle || "out",
  targetHandle: targetHandle || "in"
});

const mockDataTypes: DataType[] = [
  { slug: "any", value: 0, name: "Any", color: "#888888" },
  { slug: "text", value: 1, name: "Text", color: "#4CAF50" },
  { slug: "image", value: 2, name: "Image", color: "#2196F3" }
];

const mockGetMetadata = (nodeType: string): NodeMetadata | undefined => {
  const metadata: Record<string, NodeMetadata> = {
    "test": {
      name: "Test Node",
      inputs: [
        { id: "in", name: "Input", type: { type: { type: "text" } } }
      ],
      outputs: [
        { id: "out", name: "Output", type: { type: { type: "text" } } }
      ]
    }
  };
  return metadata[nodeType];
};

describe("useProcessedEdges", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (findOutputHandle as jest.Mock).mockReturnValue({ type: { type: "text" } });
    (findInputHandle as jest.Mock).mockReturnValue({ type: { type: "text" } });
  });

  it("returns empty arrays when no edges provided", () => {
    const { result } = renderHook(() =>
      useProcessedEdges({
        edges: [],
        nodes: [],
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges).toEqual([]);
    expect(result.current.activeGradientKeys.size).toBe(0);
  });

  it("processes basic edge with matching types", () => {
    const nodes = [
      createMockNode("node1", "test"),
      createMockNode("node2", "test")
    ];
    const edges = [createMockEdge("edge1", "node1", "node2")];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
    expect(result.current.processedEdges[0].id).toBe("edge1");
    expect(result.current.activeGradientKeys.size).toBe(0);
  });

  it("adds gradient key for different source and target types", () => {
    const nodes = [
      createMockNode("node1", "test"),
      createMockNode("node2", "test")
    ];
    const edges = [createMockEdge("edge1", "node1", "node2")];

    (findOutputHandle as jest.Mock).mockReturnValue({ type: { type: "text" } });
    (findInputHandle as jest.Mock).mockReturnValue({ type: { type: "image" } });

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
    expect(result.current.activeGradientKeys.has("gradient-text-image")).toBe(true);
  });

  it("adds bypassed class when source node is bypassed", () => {
    const nodes = [
      {
        ...createMockNode("node1", "test"),
        data: { ...createMockNode("node1").data, bypassed: true }
      },
      createMockNode("node2", "test")
    ];
    const edges = [createMockEdge("edge1", "node1", "node2")];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes: nodes as Node<NodeData>[],
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges[0].className).toContain("from-bypassed");
  });

  it("adds bypassed class when target node is bypassed", () => {
    const nodes = [
      createMockNode("node1", "test"),
      {
        ...createMockNode("node2", "test"),
        data: { ...createMockNode("node2").data, bypassed: true }
      }
    ];
    const edges = [createMockEdge("edge1", "node1", "node2")];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes: nodes as Node<NodeData>[],
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges[0].className).toContain("from-bypassed");
  });

  it("adds message-sent class when edge has message_sent status", () => {
    const nodes = [
      createMockNode("node1", "test"),
      createMockNode("node2", "test")
    ];
    const edges = [createMockEdge("edge1", "node1", "node2")];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
        workflowId: "workflow-1",
        edgeStatuses: {
          "workflow-1:edge1": { status: "message_sent", counter: 5 }
        }
      })
    );

    expect(result.current.processedEdges[0].className).toContain("message-sent");
    expect(result.current.processedEdges[0].label).toBe("5");
  });

  it("preserves original edge properties", () => {
    const nodes = [
      createMockNode("node1", "test"),
      createMockNode("node2", "test")
    ];
    const edges = [
      {
        ...createMockEdge("edge1", "node1", "node2"),
        animated: true,
        style: { stroke: "red", strokeWidth: 3 }
      }
    ];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges[0].animated).toBe(true);
    expect(result.current.processedEdges[0].style?.strokeWidth).toBe(2);
  });

  it("handles nodes that don't exist in the nodes array", () => {
    const edges = [
      createMockEdge("edge1", "nonexistent", "node2"),
      createMockEdge("edge2", "node1", "nonexistent")
    ];
    const nodes = [createMockNode("node1", "test"), createMockNode("node2", "test")];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges).toHaveLength(2);
  });

  it("handles undefined handles gracefully", () => {
    const nodes = [
      createMockNode("node1", "test"),
      createMockNode("node2", "test")
    ];
    const edges = [
      { id: "edge1", source: "node1", target: "node2" } as Edge
    ];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
    expect(result.current.processedEdges[0].sourceHandle).toBeUndefined();
    expect(result.current.processedEdges[0].targetHandle).toBeUndefined();
  });

  it("returns default 'any' type when node metadata not found", () => {
    const nodes = [
      createMockNode("node1", "unknown"),
      createMockNode("node2", "unknown")
    ];
    const edges = [createMockEdge("edge1", "node1", "node2")];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: () => undefined
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
    expect(result.current.activeGradientKeys.size).toBe(0);
  });

  it("caches result during selection drag", () => {
    const nodes = [
      createMockNode("node1", "test"),
      createMockNode("node2", "test")
    ];
    const edges = [createMockEdge("edge1", "node1", "node2")];

    const { result, rerender } = renderHook(
      ({ isSelecting }) =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: mockGetMetadata,
          isSelecting
        }),
      { initialProps: { isSelecting: false } }
    );

    const firstResult = result.current;

    rerender({ isSelecting: true });

    expect(result.current).toBe(firstResult);
  });
});
