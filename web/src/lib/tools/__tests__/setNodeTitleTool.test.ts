/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import "../builtin/setNodeTitle";

function createMockNodeStore(
  nodes: Array<{ id: string; data?: Record<string, unknown> }> = []
) {
  const dataUpdates: Array<{ id: string; data: unknown }> = [];
  return {
    getState: () => ({
      nodes,
      findNode: jest.fn((id: string) => nodes.find((n) => n.id === id)),
      updateNodeData: jest.fn((id: string, data: unknown) =>
        dataUpdates.push({ id, data })
      ),
    }),
    dataUpdates,
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

describe("ui_set_node_title tool", () => {
  it("sets the title on a node", async () => {
    const store = createMockNodeStore([{ id: "node-1" }]);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_set_node_title",
      { node_id: "node-1", title: "My Custom Title" },
      "tc-1",
      { getState: () => state }
    );

    const typed = result as { ok: boolean; node_id: string; title: string };
    expect(typed.ok).toBe(true);
    expect(typed.node_id).toBe("node-1");
    expect(typed.title).toBe("My Custom Title");
    expect(store.dataUpdates[0]).toEqual({
      id: "node-1",
      data: { title: "My Custom Title" },
    });
  });

  it("sets an empty title", async () => {
    const store = createMockNodeStore([{ id: "node-1" }]);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_set_node_title",
      { node_id: "node-1", title: "" },
      "tc-2",
      { getState: () => state }
    );

    expect((result as { ok: boolean }).ok).toBe(true);
    expect(store.dataUpdates[0].data).toEqual({ title: "" });
  });

  it("throws when node is not found", async () => {
    const store = createMockNodeStore([]);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_set_node_title",
        { node_id: "missing", title: "Title" },
        "tc-3",
        { getState: () => state }
      )
    ).rejects.toThrow("Node not found: missing");
  });

  it("throws when no node store found", async () => {
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(undefined),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_set_node_title",
        { node_id: "node-1", title: "Title" },
        "tc-4",
        { getState: () => state }
      )
    ).rejects.toThrow("No node store for workflow");
  });
});
