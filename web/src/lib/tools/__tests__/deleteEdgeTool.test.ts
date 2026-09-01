/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import "../builtin/deleteEdge";
import { callTool } from "../../../test-utils/frontendTools";

function createMockNodeStore(edges: Array<{ id: string }> = []) {
  const deletedIds: string[] = [];
  return {
    getState: () => ({
      edges,
      findEdge: jest.fn((id: string) => edges.find((e) => e.id === id)),
      deleteEdge: jest.fn((id: string) => deletedIds.push(id)),
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
    newWorkflow: jest.fn(),
    createNew: jest.fn(),
    searchTemplates: jest.fn(),
    copy: jest.fn(),
    ...overrides,
  };
}

describe("ui_delete_edge tool", () => {
  it("deletes an existing edge", async () => {
    const store = createMockNodeStore([{ id: "edge-1" }]);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await callTool<{ ok: boolean; edge_id: string }>(
      "ui_delete_edge",
      { edge_id: "edge-1" },
      "tc-1",
      { getState: () => state }
    );

    expect(result.ok).toBe(true);
    expect(result.edge_id).toBe("edge-1");
    expect(store.deletedIds).toContain("edge-1");
  });

  it("throws when edge is not found", async () => {
    const store = createMockNodeStore([]);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_delete_edge",
        { edge_id: "missing-edge" },
        "tc-2",
        { getState: () => state }
      )
    ).rejects.toThrow("Edge not found: missing-edge");
  });

  it("throws when no node store found", async () => {
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(undefined),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_delete_edge",
        { edge_id: "edge-1" },
        "tc-3",
        { getState: () => state }
      )
    ).rejects.toThrow("No node store for workflow");
  });
});
