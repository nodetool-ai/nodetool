/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import "../builtin/addNode";
import {
  nodeMetadataMap,
  nodeStoreDouble
} from "../../../test-utils/frontendToolDoubles";
import type { Node } from "@xyflow/react";
import type { NodeData } from "../../../stores/NodeData";

jest.mock("../../../utils/TypeHandler", () => ({
  valueMatchesType: jest.fn().mockReturnValue(true),
}));

function createMockNodeStore() {
  const nodes: Node<NodeData>[] = [];
  return nodeStoreDouble({
    nodes,
    addNode: (node) => {
      nodes.push(node);
    },
  });
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

describe("ui_add_node tool", () => {
  it("adds a node with object position", async () => {
    const store = createMockNodeStore();
    const metadata = nodeMetadataMap({
      "test.MyNode": {
        node_type: "test.MyNode",
        properties: [
          { name: "value", required: false, type: { type: "str" }, default: "" },
        ],
        outputs: [],
      },
    });
    const state = createMockState({
      nodeMetadata: metadata,
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_add_node",
      { id: "node-1", type: "test.MyNode", position: { x: 100, y: 200 } },
      "tc-1",
      { getState: () => state }
    );

    expect(result.ok).toBe(true);
    const addedNode = store.getState().nodes[0];
    expect(addedNode.position).toEqual({ x: 100, y: 200 });
  });

  it("normalizes JSON string position", async () => {
    const store = createMockNodeStore();
    const metadata = nodeMetadataMap({
      "test.MyNode": {
        node_type: "test.MyNode",
        properties: [],
        outputs: [],
      },
    });
    const state = createMockState({
      nodeMetadata: metadata,
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_add_node",
      { id: "node-2", type: "test.MyNode", position: '{"x": 300, "y": 400}' },
      "tc-2",
      { getState: () => state }
    );

    expect(result.ok).toBe(true);
    const addedNode = store.getState().nodes[0];
    expect(addedNode.position).toEqual({ x: 300, y: 400 });
  });

  it("normalizes comma-separated string position", async () => {
    const store = createMockNodeStore();
    const metadata = nodeMetadataMap({
      "test.MyNode": {
        node_type: "test.MyNode",
        properties: [],
        outputs: [],
      },
    });
    const state = createMockState({
      nodeMetadata: metadata,
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_add_node",
      { id: "node-3", type: "test.MyNode", position: "150, 250" },
      "tc-3",
      { getState: () => state }
    );

    expect(result.ok).toBe(true);
    const addedNode = store.getState().nodes[0];
    expect(addedNode.position).toEqual({ x: 150, y: 250 });
  });

  it("falls back to grid position for unparseable position", async () => {
    const store = createMockNodeStore();
    const metadata = nodeMetadataMap({
      "test.MyNode": {
        node_type: "test.MyNode",
        properties: [],
        outputs: [],
      },
    });
    const state = createMockState({
      nodeMetadata: metadata,
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_add_node",
      { id: "node-4", type: "test.MyNode", position: "somewhere" },
      "tc-4",
      { getState: () => state }
    );

    expect(result.ok).toBe(true);
    const addedNode = store.getState().nodes[0];
    expect(addedNode.position.x).toBeGreaterThanOrEqual(0);
    expect(addedNode.position.y).toBeGreaterThanOrEqual(0);
  });

  it("throws for unknown node type with suggestions", async () => {
    const metadata = nodeMetadataMap({
      "nodetool.text.Join": { node_type: "nodetool.text.Join", properties: [], outputs: [] },
      "nodetool.text.Template": { node_type: "nodetool.text.Template", properties: [], outputs: [] },
    });
    const store = createMockNodeStore();
    const state = createMockState({
      nodeMetadata: metadata,
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_add_node",
        { id: "node-5", type: "other.namespace.Join", position: { x: 0, y: 0 } },
        "tc-5",
        { getState: () => state }
      )
    ).rejects.toThrow(/Node type not found.*Did you mean/);
  });

  it("throws for unknown node type without suggestions when no match", async () => {
    const metadata = nodeMetadataMap({
      "nodetool.text.Join": { node_type: "nodetool.text.Join", properties: [], outputs: [] },
    });
    const store = createMockNodeStore();
    const state = createMockState({
      nodeMetadata: metadata,
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_add_node",
        { id: "node-5b", type: "completely.unrelated.XYZ", position: { x: 0, y: 0 } },
        "tc-5b",
        { getState: () => state }
      )
    ).rejects.toThrow(/Node type not found.*ui_search_nodes/);
  });

  it("throws when no node store found", async () => {
    const metadata = nodeMetadataMap({
      "test.MyNode": { node_type: "test.MyNode", properties: [], outputs: [] },
    });
    const state = createMockState({
      nodeMetadata: metadata,
      getNodeStore: jest.fn().mockReturnValue(undefined),
    });

    await expect(
      FrontendToolRegistry.call(
        "ui_add_node",
        { id: "node-6", type: "test.MyNode", position: { x: 0, y: 0 } },
        "tc-6",
        { getState: () => state }
      )
    ).rejects.toThrow("No node store for workflow");
  });

  it("returns warnings for required properties not explicitly set", async () => {
    const store = createMockNodeStore();
    const metadata = nodeMetadataMap({
      "test.MyNode": {
        node_type: "test.MyNode",
        properties: [
          { name: "prompt", required: true, type: { type: "str" }, default: "" },
        ],
        outputs: [],
      },
    });
    const state = createMockState({
      nodeMetadata: metadata,
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_add_node",
      { id: "node-7", type: "test.MyNode", position: { x: 0, y: 0 } },
      "tc-7",
      { getState: () => state }
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining("prompt")]);
  });

  it("does not warn when required property is explicitly provided", async () => {
    const store = createMockNodeStore();
    const metadata = nodeMetadataMap({
      "test.MyNode": {
        node_type: "test.MyNode",
        properties: [
          { name: "prompt", required: true, type: { type: "str" }, default: "" },
        ],
        outputs: [],
      },
    });
    const state = createMockState({
      nodeMetadata: metadata,
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_add_node",
      {
        id: "node-8",
        type: "test.MyNode",
        position: { x: 0, y: 0 },
        properties: { prompt: "hello world" },
      },
      "tc-8",
      { getState: () => state }
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toBeUndefined();
  });

  it("handles negative coordinates in string position", async () => {
    const store = createMockNodeStore();
    const metadata = nodeMetadataMap({
      "test.MyNode": {
        node_type: "test.MyNode",
        properties: [],
        outputs: [],
      },
    });
    const state = createMockState({
      nodeMetadata: metadata,
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    const result = await FrontendToolRegistry.call(
      "ui_add_node",
      { id: "node-9", type: "test.MyNode", position: "-100, -200" },
      "tc-9",
      { getState: () => state }
    );

    expect(result.ok).toBe(true);
    const addedNode = store.getState().nodes[0];
    expect(addedNode.position).toEqual({ x: -100, y: -200 });
  });

  it("stamps inferred Code handles from the body", async () => {
    const store = createMockNodeStore();
    const state = createMockState({
      nodeMetadata: nodeMetadataMap({
        "nodetool.code.Code": {
          node_type: "nodetool.code.Code",
          properties: [
            { name: "code", required: false, type: { type: "str" }, default: "" },
          ],
          outputs: [],
        },
      }),
      getNodeStore: jest.fn().mockReturnValue(store),
    });

    await FrontendToolRegistry.call(
      "ui_add_node",
      {
        id: "code-1",
        type: "nodetool.code.Code",
        position: { x: 0, y: 0 },
        properties: { code: "return { sum: inputs.a + inputs.b };" },
      },
      "tc-code",
      { getState: () => state }
    );

    const added = store.getState().nodes[0];
    expect(added.data.dynamic_properties).toEqual({ a: "", b: "" });
    expect(added.data.dynamic_outputs).toEqual({
      sum: { type: "any", type_args: [], optional: false },
    });
  });
});
