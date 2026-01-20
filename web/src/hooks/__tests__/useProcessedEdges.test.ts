import { renderHook, waitFor } from "@testing-library/react";
import { useProcessedEdges } from "../useProcessedEdges";
import { Edge, Node } from "@xyflow/react";
import { DataType } from "../config/data_types";
import { NodeMetadata } from "../stores/ApiTypes";
import { NodeData } from "../stores/NodeData";

jest.mock("../../utils/handleUtils", () => ({
  findOutputHandle: jest.fn(),
  findInputHandle: jest.fn(),
}));

jest.mock("../../stores/MetadataStore", () => ({
  useStore: jest.fn(() => ({})),
}));

const mockFindOutputHandle = jest.requireMock("../../utils/handleUtils").findOutputHandle;
const mockFindInputHandle = jest.requireMock("../../utils/handleUtils").findInputHandle;

const createMockNode = (id: string, type: string = "test"): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test-workflow",
  },
});

const createMockEdge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
  sourceHandle: "out",
  targetHandle: "in",
});

const mockGetMetadata = (nodeType: string): NodeMetadata | undefined => {
  const metadata: Record<string, NodeMetadata> = {
    test: {
      node_type: "test",
      inputs: [{ name: "in", type: "text" }],
      outputs: [{ name: "out", type: "text" }],
    },
  };
  return metadata[nodeType];
};

const mockDataTypes: DataType[] = [
  { name: "text", color: "#4ade80" },
  { name: "image", color: "#60a5fa" },
];

describe("useProcessedEdges", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOutputHandle.mockReturnValue({ type: "text" });
    mockFindInputHandle.mockReturnValue({ type: "text" });
  });

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

  it("processes edges with type information", () => {
    const edges: Edge[] = [createMockEdge("edge-1", "node-1", "node-2")];
    const nodes: Node<NodeData>[] = [
      createMockNode("node-1", "test"),
      createMockNode("node-2", "test"),
    ];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
    expect(result.current.processedEdges[0].id).toBe("edge-1");
  });

  it("adds status class when edge status is provided", () => {
    const edges: Edge[] = [createMockEdge("edge-1", "node-1", "node-2")];
    const nodes: Node<NodeData>[] = [
      createMockNode("node-1", "test"),
      createMockNode("node-2", "test"),
    ];

    const edgeStatuses = {
      "edge-1": { status: "message_sent", counter: 5 },
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

    expect(result.current.processedEdges[0]).toHaveProperty("className");
  });

  it("returns matching types with solid color", () => {
    mockFindOutputHandle.mockReturnValue({ type: "text" });
    mockFindInputHandle.mockReturnValue({ type: "text" });

    const edges: Edge[] = [createMockEdge("edge-1", "node-1", "node-2")];
    const nodes: Node<NodeData>[] = [
      createMockNode("node-1", "test"),
      createMockNode("node-2", "test"),
    ];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges[0]).toHaveProperty("style");
    expect(result.current.activeGradientKeys.size).toBe(0);
  });

  it("caches results during selection drag", () => {
    const edges: Edge[] = [createMockEdge("edge-1", "node-1", "node-2")];
    const nodes: Node<NodeData>[] = [
      createMockNode("node-1", "test"),
      createMockNode("node-2", "test"),
    ];

    const { result, rerender } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
        isSelecting: true,
      })
    );

    const firstResult = result.current;

    rerender();

    expect(result.current).toBe(firstResult);
  });

  it("recomputes when selection ends", () => {
    const edges: Edge[] = [createMockEdge("edge-1", "node-1", "node-2")];
    const nodes: Node<NodeData>[] = [
      createMockNode("node-1", "test"),
      createMockNode("node-2", "test"),
    ];

    const { result, rerender } = renderHook(
      ({ isSelecting }) =>
        useProcessedEdges({
          edges,
          nodes,
          dataTypes: mockDataTypes,
          getMetadata: mockGetMetadata,
          isSelecting,
        }),
      { initialProps: { isSelecting: true } }
    );

    const selectingResult = result.current;

    rerender({ isSelecting: false });

    expect(result.current).not.toBe(selectingResult);
  });

  it("handles nodes with missing metadata gracefully", () => {
    const edges: Edge[] = [createMockEdge("edge-1", "node-1", "node-2")];
    const nodes: Node<NodeData>[] = [
      createMockNode("node-1", "unknown"),
      createMockNode("node-2", "unknown"),
    ];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: () => undefined,
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
  });

  it("handles empty nodes array", () => {
    const edges: Edge[] = [createMockEdge("edge-1", "node-1", "node-2")];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes: [],
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
  });

  it("processes multiple edges correctly", () => {
    const edges: Edge[] = [
      createMockEdge("edge-1", "node-1", "node-2"),
      createMockEdge("edge-2", "node-2", "node-3"),
    ];
    const nodes: Node<NodeData>[] = [
      createMockNode("node-1", "test"),
      createMockNode("node-2", "test"),
      createMockNode("node-3", "test"),
    ];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges).toHaveLength(2);
    expect(result.current.processedEdges[0].id).toBe("edge-1");
    expect(result.current.processedEdges[1].id).toBe("edge-2");
  });
});
