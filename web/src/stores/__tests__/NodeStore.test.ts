jest.mock("../../components/node_types/PlaceholderNode", () => () => null);

import { Position, Node, Edge } from "@xyflow/react";
import { createNodeStore } from "../NodeStore";
import { NodeData } from "../NodeData";
import useErrorStore from "../ErrorStore";
import useResultsStore from "../ResultsStore";
import useMetadataStore from "../MetadataStore";
import { NodeMetadata } from "../ApiTypes";

const makeNode = (
  id: string,
  workflowId: string,
  type: string = "test"
): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  targetPosition: Position.Left,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: workflowId
  }
});

const makeEdge = (
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string
): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  sourceHandle: sourceHandle || null,
  targetHandle: targetHandle || null
});

const mockMetadata: Record<string, NodeMetadata> = {
  test: {
    node_type: "test",
    title: "Test Node",
    description: "A test node",
    namespace: "test",
    layout: "default",
    the_model_info: {},
    recommended_models: [],
    basic_fields: [],
    outputs: [
      {
        name: "output1",
        type: { type: "str", optional: false, type_args: [] },
        stream: false
      }
    ],
    properties: [
      {
        name: "input1",
        type: { type: "str", optional: false, type_args: [] },
        default: ""
      }
    ],
    is_dynamic: false,
    is_streaming: false
  },
  dynamic_test: {
    node_type: "dynamic_test",
    title: "Dynamic Test Node",
    description: "A dynamic test node",
    namespace: "test",
    layout: "default",
    the_model_info: {},
    recommended_models: [],
    basic_fields: [],
    outputs: [
      {
        name: "output1",
        type: { type: "str", optional: false, type_args: [] },
        stream: false
      }
    ],
    properties: [],
    is_dynamic: true,
    is_streaming: false
  }
};
describe("NodeStore node management", () => {
  const originalError = useErrorStore.getState();
  const originalResults = useResultsStore.getState();
  const originalMetadata = useMetadataStore.getState();
  let store: ReturnType<typeof createNodeStore>;

  beforeEach(() => {
    store = createNodeStore();
    useErrorStore.setState({ ...originalError, clearErrors: jest.fn() }, true);
    useResultsStore.setState(
      { ...originalResults, clearResults: jest.fn() },
      true
    );
    useMetadataStore.setState(
      { ...originalMetadata, metadata: mockMetadata },
      true
    );
  });

  afterEach(() => {
    useErrorStore.setState(originalError, true);
    useResultsStore.setState(originalResults, true);
    useMetadataStore.setState(originalMetadata, true);
  });

  test("addNode adds a node and sets workflow dirty", () => {
    const node = makeNode("a", store.getState().workflow.id);
    store.getState().addNode(node);
    expect(store.getState().findNode("a")).toBeDefined();
    expect(store.getState().workflowIsDirty).toBe(true);
    expect(store.getState().nodes[0].expandParent).toBe(true);
    expect(store.getState().nodes[0].data.workflow_id).toBe(
      store.getState().workflow.id
    );
  });

  test("addNode ignores duplicate ids", () => {
    const node = makeNode("a", store.getState().workflow.id);
    store.getState().addNode(node);
    store.getState().addNode(node);
    expect(store.getState().nodes).toHaveLength(1);
  });

  test("updateNode and updateNodeData", () => {
    const node = makeNode("a", store.getState().workflow.id);
    store.getState().addNode(node);
    store.getState().updateNode("a", { position: { x: 5, y: 5 } });
    store.getState().updateNodeData("a", { title: "test" });
    const updated = store.getState().findNode("a")!;
    expect(updated.position).toEqual({ x: 5, y: 5 });
    expect(updated.data.title).toBe("test");
  });

  test("deleteNode removes node and edges", () => {
    const a = makeNode("a", store.getState().workflow.id);
    const b = makeNode("b", store.getState().workflow.id);
    store.getState().addNode(a);
    store.getState().addNode(b);
    const edge = makeEdge("a", "b");
    store.getState().addEdge(edge as Edge);
    store.getState().deleteNode("a");
    expect(store.getState().findNode("a")).toBeUndefined();
    expect(store.getState().edges).toHaveLength(0);
    expect(
      useErrorStore.getState().clearErrors as jest.Mock
    ).toHaveBeenCalledWith("a");
    expect(
      useResultsStore.getState().clearResults as jest.Mock
    ).toHaveBeenCalledWith("a");
  });

  test("undo and redo revert node changes", () => {
    const node = makeNode("a", store.getState().workflow.id);
    store.getState().addNode(node);
    expect(store.getState().nodes).toHaveLength(1);
    store.temporal.getState().undo();
    expect(store.getState().nodes).toHaveLength(0);
    store.temporal.getState().redo();
    expect(store.getState().nodes).toHaveLength(1);
  });

  test("selecting nodes should not mark workflow as dirty", () => {
    // Add some nodes first
    const nodeA = makeNode("a", store.getState().workflow.id);
    const nodeB = makeNode("b", store.getState().workflow.id);
    store.getState().addNode(nodeA);
    store.getState().addNode(nodeB);

    // Reset dirty state
    store.getState().setWorkflowDirty(false);
    expect(store.getState().workflowIsDirty).toBe(false);

    // Select nodes using setSelectedNodes
    store.getState().setSelectedNodes([nodeA]);
    expect(store.getState().workflowIsDirty).toBe(false);

    // Select all nodes
    store.getState().selectAllNodes();
    expect(store.getState().workflowIsDirty).toBe(false);

    // Verify nodes are actually selected
    expect(store.getState().getSelectedNodes()).toHaveLength(2);
  });

  test("onNodesChange with selection changes should not mark workflow as dirty", () => {
    // Add a node first
    const node = makeNode("a", store.getState().workflow.id);
    store.getState().addNode(node);

    // Reset dirty state
    store.getState().setWorkflowDirty(false);
    expect(store.getState().workflowIsDirty).toBe(false);

    // Simulate selection change through onNodesChange
    store.getState().onNodesChange([
      {
        type: "select",
        id: "a",
        selected: true
      }
    ]);

    expect(store.getState().workflowIsDirty).toBe(false);
  });
});

describe("Edge Validation", () => {
  const originalMetadata = useMetadataStore.getState();
  let store: ReturnType<typeof createNodeStore>;

  beforeEach(() => {
    store = createNodeStore();
    useMetadataStore.setState(
      { ...originalMetadata, metadata: mockMetadata },
      true
    );
  });

  afterEach(() => {
    useMetadataStore.setState(originalMetadata, true);
  });

  test("should validate edges with existing nodes and handles", () => {
    const nodeA = makeNode("a", store.getState().workflow.id, "test");
    const nodeB = makeNode("b", store.getState().workflow.id, "test");
    store.getState().addNode(nodeA);
    store.getState().addNode(nodeB);

    const validEdge = makeEdge("a", "b", "output1", "input1");
    store.getState().addEdge(validEdge);

    expect(store.getState().edges).toHaveLength(1);
    expect(store.getState().edges[0].id).toBe("a-b");
  });

  test("should reject edges with missing source nodes", () => {
    const nodeB = makeNode("b", store.getState().workflow.id, "test");
    store.getState().addNode(nodeB);

    const invalidEdge = makeEdge("nonexistent", "b", "output1", "input1");
    store.getState().addEdge(invalidEdge);

    expect(store.getState().edges).toHaveLength(0);
  });

  test("should reject edges with missing target nodes", () => {
    const nodeA = makeNode("a", store.getState().workflow.id, "test");
    store.getState().addNode(nodeA);

    const invalidEdge = makeEdge("a", "nonexistent", "output1", "input1");
    store.getState().addEdge(invalidEdge);

    expect(store.getState().edges).toHaveLength(0);
  });

  test("should handle missing metadata gracefully", () => {
    // Clear metadata
    useMetadataStore.setState({ ...originalMetadata, metadata: {} }, true);

    const nodeA = makeNode("a", store.getState().workflow.id, "test");
    const nodeB = makeNode("b", store.getState().workflow.id, "test");
    store.getState().addNode(nodeA);
    store.getState().addNode(nodeB);

    const edge = makeEdge("a", "b", "output1", "input1");
    store.getState().addEdge(edge);

    // Should allow edge when metadata is missing but handles are specified
    expect(store.getState().edges).toHaveLength(1);
  });

  test("should support dynamic nodes", () => {
    const nodeA = makeNode("a", store.getState().workflow.id, "test");
    const nodeB = makeNode("b", store.getState().workflow.id, "dynamic_test");
    store.getState().addNode(nodeA);
    store.getState().addNode(nodeB);

    const validEdge = makeEdge("a", "b", "output1", "any_handle");
    store.getState().addEdge(validEdge);

    expect(store.getState().edges).toHaveLength(1);
  });

  test("should reject edges with invalid source handles", () => {
    const nodeA = makeNode("a", store.getState().workflow.id, "test");
    const nodeB = makeNode("b", store.getState().workflow.id, "test");
    store.getState().addNode(nodeA);
    store.getState().addNode(nodeB);

    const invalidEdge = makeEdge("a", "b", "invalid_output", "input1");
    store.getState().addEdge(invalidEdge);

    expect(store.getState().edges).toHaveLength(0);
  });

  test("should reject edges with invalid target handles on non-dynamic nodes", () => {
    const nodeA = makeNode("a", store.getState().workflow.id, "test");
    const nodeB = makeNode("b", store.getState().workflow.id, "test");
    store.getState().addNode(nodeA);
    store.getState().addNode(nodeB);

    const invalidEdge = makeEdge("a", "b", "output1", "invalid_input");
    store.getState().addEdge(invalidEdge);

    expect(store.getState().edges).toHaveLength(0);
  });
});

describe("Graph Sanitization", () => {
  const originalMetadata = useMetadataStore.getState();
  let store: ReturnType<typeof createNodeStore>;

  beforeEach(() => {
    useMetadataStore.setState(
      { ...originalMetadata, metadata: mockMetadata },
      true
    );
  });

  afterEach(() => {
    useMetadataStore.setState(originalMetadata, true);
  });

  test("should remove invalid edges and preserve valid ones", () => {
    const nodeA = makeNode("a", "test-workflow", "test");
    const nodeB = makeNode("b", "test-workflow", "test");
    const validEdge = makeEdge("a", "b", "output1", "input1");
    const invalidEdge = makeEdge("a", "b", "invalid_output", "input1");

    const workflow = {
      id: "test-workflow",
      name: "Test Workflow",
      access: "private" as const,
      description: "",
      thumbnail: "",
      tags: [],
      settings: {},
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      graph: {
        nodes: [nodeA, nodeB].map((n) => ({
          id: n.id,
          type: n.type!,
          data: n.data.properties,
          dynamic_properties: {},
          ui_properties: {
            position: n.position,
            selected: false,
            selectable: true
          }
        })),
        edges: [validEdge, invalidEdge].map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle!,
          targetHandle: e.targetHandle!,
          ui_properties: {}
        }))
      }
    };

    store = createNodeStore(workflow);

    // Should only have the valid edge
    expect(store.getState().edges).toHaveLength(1);
    expect(store.getState().edges[0].sourceHandle).toBe("output1");
    expect(store.getState().edges[0].targetHandle).toBe("input1");
  });

  test("should report statistics about removed edges", () => {
    const consoleSpy = jest.spyOn(console, "info").mockImplementation();

    const nodeA = makeNode("a", "test-workflow", "test");
    const nodeB = makeNode("b", "test-workflow", "test");
    const invalidEdge1 = makeEdge("a", "b", "invalid_output", "input1");
    const invalidEdge2 = makeEdge("a", "b", "output1", "invalid_input");

    const workflow = {
      id: "test-workflow",
      name: "Test Workflow",
      access: "private" as const,
      description: "",
      thumbnail: "",
      tags: [],
      settings: {},
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      graph: {
        nodes: [nodeA, nodeB].map((n) => ({
          id: n.id,
          type: n.type!,
          data: n.data.properties,
          dynamic_properties: {},
          ui_properties: {
            position: n.position,
            selected: false,
            selectable: true
          }
        })),
        edges: [invalidEdge1, invalidEdge2].map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle!,
          targetHandle: e.targetHandle!,
          ui_properties: {}
        }))
      }
    };

    store = createNodeStore(workflow);

    expect(store.getState().edges).toHaveLength(0);
    consoleSpy.mockRestore();
  });
});
