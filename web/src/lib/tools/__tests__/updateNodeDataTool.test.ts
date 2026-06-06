/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import "../builtin/updateNodeData";

function createMockNodeStore(
  nodes: Array<{ id: string; type?: string; data: Record<string, unknown> }>
) {
  const storeState = {
    nodes,
    findNode: (id: string) => nodes.find((n) => n.id === id),
    updateNodeData: jest.fn(),
    updateNodeProperties: jest.fn(),
  };
  return {
    getState: () => storeState,
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

describe("ui_update_node_data tool", () => {
  it("updates node properties via updateNodeProperties", async () => {
    const nodes = [
      { id: "n1", type: "test.MyNode", data: { properties: { value: "old" } } },
    ];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      nodeMetadata: {
        "test.MyNode": { properties: [] } as never,
      },
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_update_node_data",
      { node_id: "n1", data: { properties: { value: "new" } } },
      "tc-1",
      { getState: () => state }
    );

    const typed = result as { ok: boolean; node_id: string };
    expect(typed.ok).toBe(true);
    expect(typed.node_id).toBe("n1");
    expect(store.getState().updateNodeProperties).toHaveBeenCalledWith("n1", { value: "new" });
  });

  it("updates non-property data via updateNodeData", async () => {
    const nodes = [
      { id: "n1", type: "test.MyNode", data: {} },
    ];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      nodeMetadata: {
        "test.MyNode": { properties: [] } as never,
      },
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_update_node_data",
      { node_id: "n1", data: { workflow_id: "wf-2" } },
      "tc-2",
      { getState: () => state }
    );

    const typed = result as { ok: boolean };
    expect(typed.ok).toBe(true);
    expect(store.getState().updateNodeData).toHaveBeenCalledWith("n1", { workflow_id: "wf-2" });
  });

  it("throws for non-existent node", async () => {
    const store = createMockNodeStore([]);
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_update_node_data",
        { node_id: "nonexistent", data: { properties: { value: "x" } } },
        "tc-3",
        { getState: () => state }
      )
    ).rejects.toThrow("Node not found: nonexistent");
  });

  it("throws when passing a bare string for a typed model field", async () => {
    const nodes = [
      { id: "n1", type: "test.LLMNode", data: { properties: {} } },
    ];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      nodeMetadata: {
        "test.LLMNode": {
          properties: [
            { name: "model", type: { type: "language_model" } },
          ],
        } as never,
      },
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_update_node_data",
        { node_id: "n1", data: { properties: { model: "gpt-4" } } },
        "tc-4",
        { getState: () => state }
      )
    ).rejects.toThrow(/language_model object, not a string/);
  });

  it("allows typed model field when value is an object", async () => {
    const nodes = [
      { id: "n1", type: "test.LLMNode", data: { properties: {} } },
    ];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      nodeMetadata: {
        "test.LLMNode": {
          properties: [
            { name: "model", type: { type: "language_model" } },
          ],
        } as never,
      },
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_update_node_data",
      {
        node_id: "n1",
        data: {
          properties: {
            model: { type: "language_model", provider: "openai", id: "gpt-4", name: "GPT-4", repo_id: null },
          },
        },
      },
      "tc-5",
      { getState: () => state }
    );

    const typed = result as { ok: boolean };
    expect(typed.ok).toBe(true);
  });

  it("handles mixed property and non-property updates", async () => {
    const nodes = [
      { id: "n1", type: "test.MyNode", data: { properties: { value: "old" } } },
    ];
    const store = createMockNodeStore(nodes);
    const state = createMockState({
      nodeMetadata: {
        "test.MyNode": { properties: [] } as never,
      },
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_update_node_data",
      {
        node_id: "n1",
        data: {
          properties: { value: "new" },
          workflow_id: "wf-2",
        },
      },
      "tc-6",
      { getState: () => state }
    );

    const typed = result as { ok: boolean };
    expect(typed.ok).toBe(true);
    expect(store.getState().updateNodeData).toHaveBeenCalledWith("n1", { workflow_id: "wf-2" });
    expect(store.getState().updateNodeProperties).toHaveBeenCalledWith("n1", { value: "new" });
  });

  it("throws when no node store found", async () => {
    const state = createMockState({
      getNodeStore: jest.fn().mockReturnValue(undefined),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_update_node_data",
        { node_id: "n1", data: {} },
        "tc-7",
        { getState: () => state }
      )
    ).rejects.toThrow("No node store for workflow");
  });

  it("rejects all typed model field names when passed as strings", async () => {
    const modelFieldTypes = [
      "language_model",
      "image_model",
      "tts_model",
      "asr_model",
      "embedding_model",
      "video_model",
    ];

    for (const fieldType of modelFieldTypes) {
      const nodes = [
        { id: "n1", type: "test.Node", data: { properties: {} } },
      ];
      const store = createMockNodeStore(nodes);
      const state = createMockState({
        nodeMetadata: {
          "test.Node": {
            properties: [{ name: "model", type: { type: fieldType } }],
          } as never,
        },
        getNodeStore: jest.fn().mockReturnValue(store),
      });

      await expect(
        FrontendToolRegistry.call(
          "ui_update_node_data",
          { node_id: "n1", data: { properties: { model: "some-id" } } },
          `tc-model-${fieldType}`,
          { getState: () => state }
        )
      ).rejects.toThrow(`${fieldType} object, not a string`);
    }
  });
});
