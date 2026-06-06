/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import "../builtin/getGraph";

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
    newWorkflow: jest.fn() as unknown as () => ReturnType<FrontendToolState["newWorkflow"]>,
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

    const result = await FrontendToolRegistry.call(
      "ui_get_graph",
      {},
      "tc-1",
      { getState: () => state }
    );

    const typed = result as { ok: boolean; workflow_id: string; nodes: unknown[]; edges: unknown[]; validation: unknown };
    expect(typed.ok).toBe(true);
    expect(typed.workflow_id).toBe("wf-1");
    expect(typed.nodes).toHaveLength(2);
    expect(typed.edges).toHaveLength(1);
  });

  it("returns empty graph for workflow with no nodes", async () => {
    const store = createMockNodeStore([], []);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_get_graph",
      {},
      "tc-2",
      { getState: () => state }
    );

    const typed = result as { ok: boolean; nodes: unknown[]; edges: unknown[] };
    expect(typed.ok).toBe(true);
    expect(typed.nodes).toHaveLength(0);
    expect(typed.edges).toHaveLength(0);
  });

  it("throws when no node store found for workflow", async () => {
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(undefined),
    });

    await expect(
      FrontendToolRegistry.call("ui_get_graph", {}, "tc-3", {
        getState: () => state,
      })
    ).rejects.toThrow("No node store for workflow");
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
      nodeMetadata: {
        "test.NodeType": {
          properties: [
            { name: "prompt", required: true, type: { type: "str", optional: false } },
          ],
        } as never,
      },
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_get_graph",
      {},
      "tc-5",
      { getState: () => state }
    );

    const typed = result as { validation: { errors: string[]; warnings: string[]; suggestions: string[] } };
    expect(typed.validation.errors.length).toBeGreaterThan(0);
    expect(typed.validation.errors[0]).toContain("prompt");
    expect(typed.validation.errors[0]).toContain("not connected");
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
      nodeMetadata: {
        "test.NodeType": {
          properties: [
            { name: "prompt", required: true, type: { type: "str", optional: false } },
          ],
        } as never,
      },
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_get_graph",
      {},
      "tc-6",
      { getState: () => state }
    );

    const typed = result as { validation: { errors: string[] } };
    expect(typed.validation.errors).toHaveLength(0);
  });

  it("suggests removing orphaned non-structural nodes", async () => {
    const nodes = [
      { id: "n1", type: "test.Processor", position: { x: 0, y: 0 }, data: {} },
    ];
    const store = createMockNodeStore(nodes, []);
    const state = createMockState({
      nodeMetadata: {
        "test.Processor": { properties: [] } as never,
      },
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_get_graph",
      {},
      "tc-7",
      { getState: () => state }
    );

    const typed = result as { validation: { suggestions: string[] } };
    expect(typed.validation.suggestions.length).toBeGreaterThan(0);
    expect(typed.validation.suggestions[0]).toContain("no connections");
  });

  it("does not flag input/structural nodes as orphaned", async () => {
    const nodes = [
      { id: "n1", type: "nodetool.input.TextInput", position: { x: 0, y: 0 }, data: {} },
      { id: "n2", type: "nodetool.constant.Integer", position: { x: 200, y: 0 }, data: {} },
      { id: "n3", type: "nodetool.workflows.base_node.Comment", position: { x: 400, y: 0 }, data: {} },
    ];
    const store = createMockNodeStore(nodes, []);
    const state = createMockState({
      nodeMetadata: {
        "nodetool.input.TextInput": { properties: [] } as never,
        "nodetool.constant.Integer": { properties: [] } as never,
        "nodetool.workflows.base_node.Comment": { properties: [] } as never,
      },
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_get_graph",
      {},
      "tc-8",
      { getState: () => state }
    );

    const typed = result as { validation: { suggestions: string[] } };
    expect(typed.validation.suggestions).toHaveLength(0);
  });

  it("does not flag output nodes as orphaned", async () => {
    const nodes = [
      { id: "n1", type: "nodetool.output.TextOutput", position: { x: 0, y: 0 }, data: {} },
    ];
    const store = createMockNodeStore(nodes, []);
    const state = createMockState({
      nodeMetadata: {
        "nodetool.output.TextOutput": { properties: [] } as never,
      },
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_get_graph",
      {},
      "tc-9",
      { getState: () => state }
    );

    const typed = result as { validation: { suggestions: string[] } };
    expect(typed.validation.suggestions).toHaveLength(0);
  });
});
