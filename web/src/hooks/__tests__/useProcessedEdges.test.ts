import { renderHook } from "@testing-library/react";
import { useProcessedEdges } from "../useProcessedEdges";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { DataType } from "../config/data_types";

const createMockDataType = (overrides: Partial<DataType> = {}): DataType => ({
  slug: "text",
  name: "Text",
  value: "text",
  color: "#4285F4",
  defaultHandle: "output_value",
  ...overrides
});

const createMockNode = (overrides: Partial<Node<NodeData>> = {}): Node<NodeData> => ({
  id: "node-1",
  type: "default",
  position: { x: 0, y: 0 },
  data: {
    title: "Test Node",
    bypassed: false,
    dynamic_properties: {},
    dynamic_outputs: {},
    properties: {},
    sync_mode: false
  },
  ...overrides
} as Node<NodeData>);

const createMockEdge = (overrides: Partial<Edge> = {}): Edge => ({
  id: "edge-1",
  source: "node-1",
  target: "node-2",
  sourceHandle: "output_value",
  targetHandle: "input_value",
  ...overrides
});

const createMockMetadata = (overrides: Partial<NodeMetadata> = {}): NodeMetadata => ({
  title: "Test Node",
  node_type: "test.node",
  namespace: "test",
  description: "A test node",
  layout: "default",
  properties: [
    { name: "input_value", type: { type: "text", optional: false, values: null, type_args: [], type_name: null } }
  ],
  outputs: [
    { name: "output_value", type: { type: "text", optional: false, values: null, type_args: [], type_name: null } }
  ],
  the_model_info: {},
  recommended_models: [],
  ...overrides
} as unknown as NodeMetadata);

describe("useProcessedEdges", () => {
  const mockNodes: Node<NodeData>[] = [
    createMockNode({ id: "node-1", type: "test.node" }),
    createMockNode({ id: "node-2", type: "test.node" })
  ];

  const mockEdges: Edge[] = [
    createMockEdge({ id: "edge-1", source: "node-1", target: "node-2" })
  ];

  const mockDataTypes: DataType[] = [
    createMockDataType({ slug: "text", name: "Text", value: "text", color: "#4285F4" }),
    createMockDataType({ slug: "image", name: "Image", value: "image", color: "#34A853" }),
    createMockDataType({ slug: "audio", name: "Audio", value: "audio", color: "#EA4335" }),
    createMockDataType({ slug: "any", name: "Any", value: "any", color: "#888888" })
  ];

  const mockGetMetadata = jest.fn((type: string) => {
    if (type === "test.node") {
      return createMockMetadata();
    }
    return undefined;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty arrays when no edges provided", () => {
    const { result } = renderHook(() =>
      useProcessedEdges({
        edges: [],
        nodes: mockNodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges).toEqual([]);
    expect(result.current.activeGradientKeys.size).toBe(0);
  });

  it("processes edges with matching types", () => {
    const { result } = renderHook(() =>
      useProcessedEdges({
        edges: mockEdges,
        nodes: mockNodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
    expect(result.current.processedEdges[0].id).toBe("edge-1");
    expect(result.current.processedEdges[0].style?.stroke).toBe("#4285F4");
    expect(result.current.activeGradientKeys.size).toBe(0);
  });

  it("creates gradient for different source and target types", () => {
    const targetNode = createMockNode({
      id: "node-2",
      type: "test.node",
      data: {
        ...createMockNode().data,
        dynamic_outputs: { image_output: { type: "image" } }
      }
    });

    const imageOutputNode = createMockNode({
      id: "node-3",
      type: "test.node",
      data: {
        ...createMockNode().data,
        properties: { image_input: { type: "image" } }
      }
    });

    const nodes = [targetNode, imageOutputNode];

    const edges: Edge[] = [
      createMockEdge({ id: "edge-1", source: "node-2", target: "node-3", targetHandle: "image_input" })
    ];

    const metadataWithOutputs = createMockMetadata({
      properties: [
        { name: "image_input", type: { type: "image", optional: false, values: null, type_args: [], type_name: null } }
      ],
      outputs: [
        { name: "image_output", type: { type: "image", optional: false, values: null, type_args: [], type_name: null } }
      ]
    });

    const getMetadata = jest.fn((type: string) => {
      if (type === "test.node") {return metadataWithOutputs;}
      return undefined;
    });

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata
      })
    );

    expect(result.current.processedEdges[0].style?.stroke).toContain("url(#");
    expect(result.current.activeGradientKeys.size).toBe(1);
  });

  it("adds bypassed class when source node is bypassed", () => {
    const bypassedNode = createMockNode({
      id: "node-1",
      type: "test.node",
      data: { ...createMockNode().data, bypassed: true }
    });

    const nodes = [bypassedNode, createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges[0].className).toContain("from-bypassed");
  });

  it("adds bypassed class when target node is bypassed", () => {
    const nodes = [
      createMockNode({ id: "node-1" }),
      createMockNode({ id: "node-2", data: { ...createMockNode().data, bypassed: true } })
    ];
    const edges = [createMockEdge()];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges[0].className).toContain("from-bypassed");
  });

  it("adds message-sent class when edge has message_sent status", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
        workflowId: "workflow-1",
        edgeStatuses: { "workflow-1:edge-1": { status: "message_sent", counter: 5 } }
      })
    );

    expect(result.current.processedEdges[0].className).toContain("message-sent");
    expect(result.current.processedEdges[0].label).toBe("5");
  });

  it("displays counter on edge with message count", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
        workflowId: "workflow-1",
        edgeStatuses: { "workflow-1:edge-1": { status: "message_sent", counter: 42 } }
      })
    );

    expect(result.current.processedEdges[0].label).toBe("42");
  });

  it("uses default color for unknown data types", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];

    const unknownTypeDataTypes: DataType[] = [
      createMockDataType({ slug: "any", name: "Any", value: "any", color: "#888888" })
    ];

    const getMetadata = jest.fn().mockReturnValue(undefined);

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: unknownTypeDataTypes,
        getMetadata
      })
    );

    expect(result.current.processedEdges[0].style?.stroke).toBe("#888888");
  });

  it("handles empty nodes array", () => {
    const edges = [createMockEdge()];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes: [],
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
    expect(result.current.processedEdges[0].style?.stroke).toBe("#888888");
  });

  it("handles edges with missing nodes gracefully", () => {
    const edges = [createMockEdge({ source: "nonexistent", target: "node-2" })];

    const getMetadata = jest.fn().mockReturnValue(undefined);

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes: mockNodes,
        dataTypes: mockDataTypes,
        getMetadata
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
    expect(result.current.processedEdges[0].style?.stroke).toBe("#888888");
  });
});
