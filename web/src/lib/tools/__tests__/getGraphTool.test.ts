/**
 * @jest-environment node
 */
jest.mock("../../../serverState/useWorkflow", () => ({
  fetchWorkflowById: jest.fn()
}));

import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import { fetchWorkflowById } from "../../../serverState/useWorkflow";
import type { Workflow } from "../../../stores/ApiTypes";
import "../builtin/getGraph";
import {
  callTool,
  nodeMetadataMap
} from "../../../test-utils/frontendTools";
import { stub } from "../../../test-utils/doubles";

const fetchWorkflowByIdMock = jest.mocked(fetchWorkflowById);

/** What `ui_get_graph` answers. */
type GetGraphResult = {
  ok: boolean;
  workflow_id: string;
  source: string;
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: unknown[];
  validation: { errors: string[]; warnings: string[]; suggestions: string[] };
};

afterEach(() => {
  fetchWorkflowByIdMock.mockReset();
});

function createMockNodeStore(
  nodes: Array<{ id: string; type?: string; position: { x: number; y: number }; data: Record<string, unknown> }>,
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>
) {
  return {
    getState: () => ({
      nodes,
      edges,
      findNode: (id: string) => nodes.find((n) => n.id === id),
    }),
  };
}

function createMockState(
  overrides: Partial<FrontendToolState> = {}
): FrontendToolState {
  return {
    nodeMetadata: {},
    currentWorkflowId: "wf-1",
    getWorkflow: jest.fn(),
    addWorkflow: jest.fn(),
    removeWorkflow: jest.fn(),
    getNodeStore: jest.fn(),
    updateWorkflow: jest.fn(),
    saveWorkflow: jest.fn(),
    getCurrentWorkflow: jest.fn(),
    setCurrentWorkflowId: jest.fn(),
    fetchWorkflow: jest.fn(),
    newWorkflow: jest.fn(),
    createNew: jest.fn(),
    searchTemplates: jest.fn(),
    copy: jest.fn(),
    ...overrides,
  };
}

describe("ui_get_graph tool", () => {
  it("returns nodes and edges from the current workflow", async () => {
    const nodes = [
      { id: "n1", type: "nodetool.constant.String", position: { x: 0, y: 0 }, data: { value: "hello" } },
      { id: "n2", type: "nodetool.text.Join", position: { x: 200, y: 0 }, data: {} },
    ];
    const edges = [
      { id: "e1", source: "n1", target: "n2", sourceHandle: "output", targetHandle: "input" },
    ];
    const store = createMockNodeStore(nodes, edges);

    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await callTool<GetGraphResult>(
      "ui_get_graph",
      {},
      "tc-1",
      { getState: () => state }
    );

    expect(result.ok).toBe(true);
    expect(result.workflow_id).toBe("wf-1");
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  it("returns empty graph for workflow with no nodes", async () => {
    const store = createMockNodeStore([], []);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await callTool<GetGraphResult>(
      "ui_get_graph",
      {},
      "tc-2",
      { getState: () => state }
    );

    expect(result.ok).toBe(true);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("reads the workflow from the server when no editor is open", async () => {
    fetchWorkflowByIdMock.mockResolvedValue(
      stub<Workflow>({
      id: "wf-1",
      name: "Created over the API",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.code.Code",
            data: { code: "return { out: 1 };" },
            ui_properties: { position: { x: 10, y: 20 } },
          },
        ],
        edges: [
          { id: "e1", source: "n0", target: "n1", targetHandle: "code" },
        ],
      },
      })
    );

    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(undefined),
    });

    const result = await callTool<GetGraphResult>(
      "ui_get_graph",
      { workflow_id: "wf-1" },
      "tc-3",
      { getState: () => state }
    );

    expect(fetchWorkflowByIdMock).toHaveBeenCalledWith("wf-1");
    expect(result.ok).toBe(true);
    expect(result.source).toBe("server");
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].position).toEqual({ x: 10, y: 20 });
    expect(result.nodes[0].data.properties).toEqual({
      code: "return { out: 1 };",
    });
    expect(result.edges).toHaveLength(1);
  });

  it("falls back to the origin when a stored position has no coordinates", async () => {
    fetchWorkflowByIdMock.mockResolvedValue(
      stub<Workflow>({
        id: "wf-1",
        name: "Half-written position",
        graph: {
          nodes: [
            {
              id: "n1",
              type: "nodetool.text.Join",
              data: {},
              ui_properties: { position: { x: "10" } },
            },
          ],
          edges: [],
        },
      })
    );

    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(undefined),
    });

    const result = await callTool<GetGraphResult>(
      "ui_get_graph",
      {},
      "tc-3-pos",
      { getState: () => state }
    );

    expect(result.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("reads the already-cached workflow without a server call", async () => {
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(undefined),
      getWorkflow: jest.fn().mockReturnValue({
        id: "wf-1",
        name: "Cached",
        graph: { nodes: [], edges: [] },
      }),
    });

    const result = await callTool<GetGraphResult>(
      "ui_get_graph",
      {},
      "tc-3b",
      { getState: () => state }
    );

    expect(fetchWorkflowByIdMock).not.toHaveBeenCalled();
    expect(result.source).toBe("server");
  });

  it("names the workflow when neither an editor nor the server has it", async () => {
    fetchWorkflowByIdMock.mockRejectedValue(new Error("404 not found"));
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(undefined),
    });

    await expect(
      FrontendToolRegistry.call("ui_get_graph", {}, "tc-3c", {
        getState: () => state,
      })
    ).rejects.toThrow(/Cannot read workflow wf-1.*404 not found/s);
  });

  it("marks a graph read from an open editor as source editor", async () => {
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(createMockNodeStore([], [])),
    });

    const result = await callTool<GetGraphResult>(
      "ui_get_graph",
      {},
      "tc-3d",
      { getState: () => state }
    );

    expect(result.source).toBe("editor");
  });

  it("throws when no current workflow is selected", async () => {
    const state = createMockState({
      currentWorkflowId: null,
    });

    await expect(
      FrontendToolRegistry.call("ui_get_graph", {}, "tc-4", {
        getState: () => state,
      })
    ).rejects.toThrow("No current workflow selected");
  });

  it("detects required properties that are not connected and have no value", async () => {
    const nodes = [
      { id: "n1", type: "test.NodeType", position: { x: 0, y: 0 }, data: {} },
    ];
    const store = createMockNodeStore(nodes, []);
    const state = createMockState({
      nodeMetadata: nodeMetadataMap({
        "test.NodeType": {
          properties: [
            { name: "prompt", required: true, type: { type: "str", optional: false } },
          ],
        },
      }),
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await callTool<GetGraphResult>(
      "ui_get_graph",
      {},
      "tc-5",
      { getState: () => state }
    );

    expect(result.validation.errors.length).toBeGreaterThan(0);
    expect(result.validation.errors[0]).toContain("prompt");
    expect(result.validation.errors[0]).toContain("not connected");
  });

  it("does not flag required properties that are connected", async () => {
    const nodes = [
      { id: "n1", type: "nodetool.constant.String", position: { x: 0, y: 0 }, data: { value: "hi" } },
      { id: "n2", type: "test.NodeType", position: { x: 200, y: 0 }, data: {} },
    ];
    const edges = [
      { id: "e1", source: "n1", target: "n2", sourceHandle: "output", targetHandle: "prompt" },
    ];
    const store = createMockNodeStore(nodes, edges);
    const state = createMockState({
      nodeMetadata: nodeMetadataMap({
        "test.NodeType": {
          properties: [
            { name: "prompt", required: true, type: { type: "str", optional: false } },
          ],
        },
      }),
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await callTool<GetGraphResult>(
      "ui_get_graph",
      {},
      "tc-6",
      { getState: () => state }
    );

    expect(result.validation.errors).toHaveLength(0);
  });

  it("suggests removing orphaned non-structural nodes", async () => {
    const nodes = [
      { id: "n1", type: "test.Processor", position: { x: 0, y: 0 }, data: {} },
    ];
    const store = createMockNodeStore(nodes, []);
    const state = createMockState({
      nodeMetadata: nodeMetadataMap({
        "test.Processor": { properties: [] },
      }),
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await callTool<GetGraphResult>(
      "ui_get_graph",
      {},
      "tc-7",
      { getState: () => state }
    );

    expect(result.validation.suggestions.length).toBeGreaterThan(0);
    expect(result.validation.suggestions[0]).toContain("no connections");
  });

  it("does not flag input/structural nodes as orphaned", async () => {
    const nodes = [
      { id: "n1", type: "nodetool.input.TextInput", position: { x: 0, y: 0 }, data: {} },
      { id: "n2", type: "nodetool.constant.Integer", position: { x: 200, y: 0 }, data: {} },
      { id: "n3", type: "nodetool.workflows.base_node.Comment", position: { x: 400, y: 0 }, data: {} },
    ];
    const store = createMockNodeStore(nodes, []);
    const state = createMockState({
      nodeMetadata: nodeMetadataMap({
        "nodetool.input.TextInput": { properties: [] },
        "nodetool.constant.Integer": { properties: [] },
        "nodetool.workflows.base_node.Comment": { properties: [] },
      }),
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await callTool<GetGraphResult>(
      "ui_get_graph",
      {},
      "tc-8",
      { getState: () => state }
    );

    expect(result.validation.suggestions).toHaveLength(0);
  });

  it("does not flag output nodes as orphaned", async () => {
    const nodes = [
      { id: "n1", type: "nodetool.output.TextOutput", position: { x: 0, y: 0 }, data: {} },
    ];
    const store = createMockNodeStore(nodes, []);
    const state = createMockState({
      nodeMetadata: nodeMetadataMap({
        "nodetool.output.TextOutput": { properties: [] },
      }),
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await callTool<GetGraphResult>(
      "ui_get_graph",
      {},
      "tc-9",
      { getState: () => state }
    );

    expect(result.validation.suggestions).toHaveLength(0);
  });

  describe("Code nodes", () => {
    const codeGraph = async (
      data: Record<string, unknown>,
      edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }> = [],
      extraNodes: Array<{ id: string; type?: string; position: { x: number; y: number }; data: Record<string, unknown> }> = []
    ) => {
      const nodes = [
        { id: "c1", type: "nodetool.code.Code", position: { x: 0, y: 0 }, data },
        ...extraNodes,
      ];
      const state = createMockState({
        nodeMetadata: nodeMetadataMap({
          "nodetool.code.Code": { properties: [] }
        }),
        getNodeStore: jest.fn().mockReturnValue(createMockNodeStore(nodes, edges)),
      });
      const result = await callTool<GetGraphResult>(
        "ui_get_graph",
        {},
        "tc-code",
        { getState: () => state }
      );
      return result.validation.errors;
    };

    it("reports a body that does not parse", async () => {
      const errors = await codeGraph({ properties: { code: "return { x: };" } });
      expect(errors.join("\n")).toContain("does not parse");
    });

    it("treats a named inputs read as a handle, not an error", async () => {
      const errors = await codeGraph({
        properties: { code: "return { out: inputs.rows.concat(inputs.extra) };" },
        dynamic_properties: { rows: [] },
      });
      expect(errors.join("\n")).not.toContain('"inputs.extra"');
      expect(errors.join("\n")).not.toContain("does not parse");
    });

    it("accepts inputs that arrive over an edge", async () => {
      const errors = await codeGraph(
        { properties: { code: "return { out: inputs.text.length };" } },
        [{ id: "e1", source: "s1", target: "c1", sourceHandle: "output", targetHandle: "text" }],
        [{ id: "s1", type: "nodetool.constant.String", position: { x: -200, y: 0 }, data: {} }]
      );
      expect(errors).toHaveLength(0);
    });

    it("leaves a body it cannot see alone", async () => {
      const errors = await codeGraph(
        { properties: { code: "" } },
        [{ id: "e1", source: "s1", target: "c1", sourceHandle: "output", targetHandle: "code" }],
        [{ id: "s1", type: "nodetool.constant.String", position: { x: -200, y: 0 }, data: {} }]
      );
      expect(errors).toHaveLength(0);
    });
  });
});
