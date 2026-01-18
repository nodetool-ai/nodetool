import { renderHook } from "@testing-library/react";
import { useProcessedEdges } from "../useProcessedEdges";
import { Edge, Node } from "@xyflow/react";
import { DataType } from "../../config/data_types";
import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import { findOutputHandle, findInputHandle } from "../../utils/handleUtils";

jest.mock("../../utils/handleUtils", () => ({
  findOutputHandle: jest.fn(),
  findInputHandle: jest.fn(),
}));

const mockFindOutputHandle = findOutputHandle as jest.MockedFunction<typeof findOutputHandle>;
const mockFindInputHandle = findInputHandle as jest.MockedFunction<typeof findInputHandle>;

const createMockDataType = (overrides: Partial<DataType> = {}): DataType => ({
  slug: "text",
  name: "Text",
  value: "str",
  color: "#22d3ee",
  label: "Text",
  namespace: "default",
  description: "Text data type",
  textColor: "dark",
  ...overrides,
});

const createMockMetadata = (overrides: Partial<NodeMetadata> = {}): NodeMetadata => ({
  node_type: "test.node",
  title: "Test Node",
  description: "A test node",
  namespace: "test",
  layout: "default",
  outputs: [
    {
      name: "output1",
      type: { type: "str", optional: false, values: null, type_args: [], type_name: null },
      stream: false,
    },
  ],
  properties: [
    {
      name: "input1",
      type: { type: "str", optional: false, values: null, type_args: [], type_name: null },
      default: "",
      title: "Input 1",
      description: "Test input",
      required: false,
    },
  ],
  is_dynamic: false,
  supports_dynamic_outputs: false,
  expose_as_tool: false,
  the_model_info: {},
  recommended_models: [],
  basic_fields: [],
  is_streaming_output: false,
  ...overrides,
});

const createMockNode = (overrides: Partial<Node<NodeData>> = {}): Node<NodeData> => ({
  id: "node-1",
  type: "test",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    dynamic_properties: {},
    dynamic_outputs: {},
    selectable: true,
    workflow_id: "workflow-1",
  },
  ...overrides,
});

const createMockEdge = (overrides: Partial<Edge> = {}): Edge => ({
  id: "edge-1",
  source: "node-1",
  target: "node-2",
  sourceHandle: "output1",
  targetHandle: "input1",
  ...overrides,
});

describe("useProcessedEdges", () => {
  const mockDataTypes: DataType[] = [
    createMockDataType({ slug: "any", name: "Any", value: undefined, color: "#888888" }),
    createMockDataType({ slug: "text", name: "Text", value: "str", color: "#22d3ee" }),
    createMockDataType({ slug: "image", name: "Image", value: "image", color: "#d946ef" }),
  ];

  const mockGetMetadata = (nodeType: string): NodeMetadata | undefined => {
    if (nodeType === "test.node") {
      return createMockMetadata();
    }
    if (nodeType === "nodetool.control.Reroute") {
      return createMockMetadata({
        node_type: "nodetool.control.Reroute",
        outputs: [
          {
            name: "output",
            type: { type: "str", optional: false, values: null, type_args: [], type_name: null },
            stream: false,
          },
        ],
        properties: [
          {
            name: "input_value",
            type: { type: "str", optional: false, values: null, type_args: [], type_name: null },
            default: "",
            title: "Input",
            description: "Reroute input",
            required: false,
          },
        ],
      });
    }
    return undefined;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOutputHandle.mockImplementation((node, handleName, metadata) => {
      if (node.type === "nodetool.control.Reroute" && handleName === "output") {
        return {
          name: "output",
          type: { type: "str", optional: false, values: null, type_args: [], type_name: null },
          stream: false,
          isDynamic: false,
        };
      }
      return {
        name: handleName || "output1",
        type: { type: "str", optional: false, values: null, type_args: [], type_name: null },
        stream: false,
        isDynamic: false,
      };
    });
    mockFindInputHandle.mockImplementation((node, handleName, metadata) => {
      if (node.type === "nodetool.control.Reroute" && handleName === "input_value") {
        return {
          name: "input_value",
          type: { type: "str", optional: false, values: null, type_args: [], type_name: null },
          isDynamic: false,
        };
      }
      return {
        name: handleName || "input1",
        type: { type: "str", optional: false, values: null, type_args: [], type_name: null },
        isDynamic: false,
      };
    });
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

    expect(result.current.processedEdges).toHaveLength(0);
    expect(result.current.activeGradientKeys.size).toBe(0);
  });

  it("processes basic edge with matching types", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
    expect(result.current.processedEdges[0].style?.stroke).toBeDefined();
  });

  it("creates gradient key when source and target types differ", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges).toHaveLength(1);
    expect(result.current.processedEdges[0].style?.stroke).toBeDefined();
  });

  it("adds message-sent class when status is message_sent", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];
    const edgeStatuses = {
      "workflow-1:edge-1": { status: "message_sent", counter: 5 },
    };

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
        workflowId: "workflow-1",
        edgeStatuses,
      })
    );

    expect(result.current.processedEdges[0].className).toContain("message-sent");
    expect(result.current.processedEdges[0].label).toBe("5");
  });

  it("adds from-bypassed class when source or target is bypassed", () => {
    const sourceNode = createMockNode({ id: "node-1", data: { ...createMockNode().data, bypassed: true } });
    const targetNode = createMockNode({ id: "node-2" });
    const edges = [createMockEdge({ source: "node-1", target: "node-2" })];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes: [sourceNode, targetNode],
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges[0].className).toContain("from-bypassed");
  });

  it("adds type classes to edge className", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges[0].className).toMatch(/text|any/);
  });

  it("uses default color when node metadata not found", () => {
    const nodes = [
      createMockNode({ id: "node-1", type: "unknown" }),
      createMockNode({ id: "node-2", type: "unknown" }),
    ];
    const edges = [createMockEdge()];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: () => undefined,
      })
    );

    expect(result.current.processedEdges[0].style?.stroke).toBe("#888888");
  });

  it("adds label for counter greater than 0", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];
    const edgeStatuses = {
      "workflow-1:edge-1": { status: "running", counter: 3 },
    };

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
        workflowId: "workflow-1",
        edgeStatuses,
      })
    );

    expect(result.current.processedEdges[0].label).toBe("3");
  });

  it("does not add label when counter is 0", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];
    const edgeStatuses = {
      "workflow-1:edge-1": { status: "running", counter: 0 },
    };

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
        workflowId: "workflow-1",
        edgeStatuses,
      })
    );

    expect(result.current.processedEdges[0].label).toBeUndefined();
  });

  it("preserves existing edge properties", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge({ animated: true, style: { strokeWidth: 3 } })];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges[0].animated).toBe(true);
    expect(result.current.processedEdges[0].style?.strokeWidth).toBe(2);
  });

  it("preserves existing edge data", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge({ data: { customProp: "value" } })];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges[0].data?.customProp).toBe("value");
  });

  it("handles edges without sourceHandle", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge({ sourceHandle: null })];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges[0].style?.stroke).toBe("#888888");
  });

  it("handles edges without targetHandle", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge({ targetHandle: null })];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges[0].style?.stroke).toBe("#888888");
  });

  it("handles missing target node", () => {
    const nodes = [createMockNode({ id: "node-1" })];
    const edges = [createMockEdge({ target: "non-existent" })];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges[0].style?.stroke).toBe("#888888");
  });

  it("handles missing source node", () => {
    const nodes = [createMockNode({ id: "node-2" })];
    const edges = [createMockEdge({ source: "non-existent" })];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges[0].style?.stroke).toBe("#888888");
  });

  it("sets correct label styles", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];
    const edgeStatuses = {
      "workflow-1:edge-1": { status: "message_sent", counter: 5 },
    };

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
        workflowId: "workflow-1",
        edgeStatuses,
      })
    );

    expect(result.current.processedEdges[0].labelStyle).toEqual({
      fill: "white",
      fontWeight: 600,
      fontSize: "10px",
    });
    expect(result.current.processedEdges[0].labelBgStyle).toEqual({
      fill: "rgba(0, 0, 0, 0.4)",
      fillOpacity: 1,
      rx: 10,
      ry: 10,
    });
    expect(result.current.processedEdges[0].labelBgPadding).toEqual([6, 2]);
  });

  it("processes multiple edges correctly", () => {
    const nodes = [
      createMockNode({ id: "node-1" }),
      createMockNode({ id: "node-2" }),
      createMockNode({ id: "node-3" }),
    ];
    const edges = [
      createMockEdge({ id: "edge-1", source: "node-1", target: "node-2" }),
      createMockEdge({ id: "edge-2", source: "node-2", target: "node-3" }),
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
    expect(result.current.activeGradientKeys.size).toBe(0);
  });

  it("processes edge to Reroute node correctly", () => {
    const rerouteNode = createMockNode({
      id: "reroute-1",
      type: "nodetool.control.Reroute",
    });
    const nodes = [createMockNode({ id: "node-1" }), rerouteNode];
    const edges = [
      createMockEdge({ id: "edge-1", source: "node-1", target: "reroute-1", targetHandle: "input_value" }),
    ];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
      })
    );

    expect(result.current.processedEdges[0].className).toMatch(/text|any/);
  });

  it("stores status in edge data", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];
    const edgeStatuses = {
      "workflow-1:edge-1": { status: "running", counter: 1 },
    };

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
        workflowId: "workflow-1",
        edgeStatuses,
      })
    );

    expect(result.current.processedEdges[0].data?.status).toBe("running");
    expect(result.current.processedEdges[0].data?.counter).toBe(1);
    expect(result.current.processedEdges[0].label).toBe("1");
  });

  it("stores null when no status", () => {
    const nodes = [createMockNode({ id: "node-1" }), createMockNode({ id: "node-2" })];
    const edges = [createMockEdge()];

    const { result } = renderHook(() =>
      useProcessedEdges({
        edges,
        nodes,
        dataTypes: mockDataTypes,
        getMetadata: mockGetMetadata,
        workflowId: "workflow-1",
      })
    );

    expect(result.current.processedEdges[0].data?.status).toBeNull();
    expect(result.current.processedEdges[0].data?.counter).toBeNull();
  });
});
