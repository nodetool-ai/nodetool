/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import "../builtin/deleteNode";

function createMockNodeStore(nodes: Array<{ id: string }> = []) {
  const deletedIds: string[] = [];
  return {
    getState: () => ({
      nodes,
      findNode: jest.fn((id: string) => nodes.find((n) => n.id === id)),
      deleteNode: jest.fn((id: string) => deletedIds.push(id)),
    }),
    deletedIds,
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

describe("ui_delete_node tool", () => {
  it("deletes an existing node", async () => {
    const store = createMockNodeStore([{ id: "node-1" }]);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_delete_node",
      { node_id: "node-1" },
      "tc-1",
      { getState: () => state }
    );

    expect((result as { ok: boolean }).ok).toBe(true);
    expect((result as { node_id: string }).node_id).toBe("node-1");
    expect(store.deletedIds).toContain("node-1");
  });

  it("throws when node is not found", async () => {
    const store = createMockNodeStore([]);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_delete_node",
        { node_id: "missing-node" },
        "tc-2",
        { getState: () => state }
      )
    ).rejects.toThrow("Node not found: missing-node");
  });

  it("throws when no node store found", async () => {
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(undefined),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_delete_node",
        { node_id: "node-1" },
        "tc-3",
        { getState: () => state }
      )
    ).rejects.toThrow("No node store for workflow");
  });
});
