/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import "../builtin/moveNode";

function createMockNodeStore(
  nodes: Array<{ id: string; position?: { x: number; y: number } }> = []
) {
  const updates: Array<{ id: string; patch: unknown }> = [];
  return {
    getState: () => ({
      nodes,
      findNode: jest.fn((id: string) => nodes.find((n) => n.id === id)),
      updateNode: jest.fn((id: string, patch: unknown) =>
        updates.push({ id, patch })
      ),
    }),
    updates,
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

describe("ui_move_node tool", () => {
  it("moves a node to the specified position", async () => {
    const store = createMockNodeStore([
      { id: "node-1", position: { x: 0, y: 0 } },
    ]);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_move_node",
      { node_id: "node-1", position: { x: 300, y: 400 } },
      "tc-1",
      { getState: () => state }
    );

    const typed = result as { ok: boolean; node_id: string; position: { x: number; y: number } };
    expect(typed.ok).toBe(true);
    expect(typed.node_id).toBe("node-1");
    expect(typed.position).toEqual({ x: 300, y: 400 });
    expect(store.updates[0].patch).toEqual({
      position: { x: 300, y: 400 },
    });
  });

  it("moves to negative coordinates", async () => {
    const store = createMockNodeStore([{ id: "node-1" }]);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_move_node",
      { node_id: "node-1", position: { x: -50, y: -100 } },
      "tc-2",
      { getState: () => state }
    );

    expect((result as { ok: boolean }).ok).toBe(true);
    expect(store.updates[0].patch).toEqual({
      position: { x: -50, y: -100 },
    });
  });

  it("throws when node is not found", async () => {
    const store = createMockNodeStore([]);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_move_node",
        { node_id: "missing", position: { x: 0, y: 0 } },
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
        "ui_move_node",
        { node_id: "node-1", position: { x: 0, y: 0 } },
        "tc-4",
        { getState: () => state }
      )
    ).rejects.toThrow("No node store for workflow");
  });
});
