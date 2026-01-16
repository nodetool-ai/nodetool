import { graphNodeToReactFlowNode } from "../graphNodeToReactFlowNode";
import { Workflow, Node as GraphNode } from "../ApiTypes";

jest.mock("../NodeStore", () => ({
  DEFAULT_NODE_WIDTH: 200,
  NodeUIProperties: {} as any
}));

jest.mock("@xyflow/react", () => ({
  Node: class Node {
    constructor() {}
  }
}));

describe("graphNodeToReactFlowNode", () => {
  const createMockWorkflow = (): Workflow => ({
    id: "workflow-123",
    name: "Test Workflow",
    package_name: "test",
    description: "Test workflow description",
    access: "private",
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: "user-1"
  });

  const createMockGraphNode = (overrides: Partial<GraphNode> = {}): GraphNode => ({
    id: "node-1",
    type: "test.node.Type",
    data: { prop1: "value1" },
    dynamic_properties: {},
    dynamic_outputs: {},
    parent_id: undefined,
    ui_properties: {
      position: { x: 100, y: 200 },
      width: 200,
      height: 100,
      selectable: true,
      title: "Test Node",
      color: "#ff0000"
    },
    ...overrides
  });

  it("converts a basic graph node to ReactFlow node", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.id).toBe("node-1");
    expect(result.type).toBe("test.node.Type");
    expect(result.position).toEqual({ x: 100, y: 200 });
    expect(result.data.properties).toEqual({ prop1: "value1" });
    expect(result.data.workflow_id).toBe("workflow-123");
  });

  it("sets default width when ui_properties width is not provided", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: { position: { x: 0, y: 0 } }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.style?.width).toBeDefined();
  });

  it("applies custom width from ui_properties", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: { position: { x: 0, y: 0 }, width: 300, height: 150 }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.style?.width).toBe(300);
    expect(result.style?.height).toBe(150);
  });

  it("sets default width to 400 for Preview nodes", () => {
    const workflow = createMockWorkflow();
    const previewNode: GraphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Preview",
      ui_properties: { position: { x: 0, y: 0 } }
    });

    const result = graphNodeToReactFlowNode(workflow, previewNode);

    expect(result.style?.width).toBe(400);
    expect(result.style?.height).toBe(300);
  });

  it("sets default width to 450 for CompareImages nodes", () => {
    const workflow = createMockWorkflow();
    const compareNode: GraphNode = createMockGraphNode({
      type: "nodetool.compare.CompareImages",
      ui_properties: { position: { x: 0, y: 0 } }
    });

    const result = graphNodeToReactFlowNode(workflow, compareNode);

    expect(result.style?.width).toBe(450);
    expect(result.style?.height).toBe(350);
  });

  it("preserves custom dimensions for Preview nodes when provided", () => {
    const workflow = createMockWorkflow();
    const previewNode: GraphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Preview",
      ui_properties: { position: { x: 0, y: 0 }, width: 500, height: 400 }
    });

    const result = graphNodeToReactFlowNode(workflow, previewNode);

    expect(result.style?.width).toBe(500);
    expect(result.style?.height).toBe(400);
  });

  it("sets parentId when provided in graph node", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      parent_id: "parent-node-1"
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.parentId).toBe("parent-node-1");
  });

  it("does not set parentId when undefined", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.parentId).toBeUndefined();
  });

  it("sets expandParent to false for Loop nodes", () => {
    const workflow = createMockWorkflow();
    const loopNode: GraphNode = createMockGraphNode({
      type: "nodetool.group.Loop"
    });

    const result = graphNodeToReactFlowNode(workflow, loopNode);

    expect(result.expandParent).toBe(false);
  });

  it("sets expandParent to false for Comment nodes", () => {
    const workflow = createMockWorkflow();
    const commentNode: GraphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Comment"
    });

    const result = graphNodeToReactFlowNode(workflow, commentNode);

    expect(result.expandParent).toBe(false);
  });

  it("sets expandParent to false for Group nodes", () => {
    const workflow = createMockWorkflow();
    const groupNode: GraphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Group"
    });

    const result = graphNodeToReactFlowNode(workflow, groupNode);

    expect(result.expandParent).toBe(false);
  });

  it("sets expandParent to true for regular nodes", () => {
    const workflow = createMockWorkflow();
    const regularNode: GraphNode = createMockGraphNode({
      type: "test.node.Type"
    });

    const result = graphNodeToReactFlowNode(workflow, regularNode);

    expect(result.expandParent).toBe(true);
  });

  it("adds bypassed class when node is bypassed", () => {
    const workflow = createMockWorkflow();
    const bypassedNode: GraphNode = createMockGraphNode({
      ui_properties: { position: { x: 0, y: 0 }, bypassed: true }
    });

    const result = graphNodeToReactFlowNode(workflow, bypassedNode);

    expect(result.className).toBe("bypassed");
  });

  it("does not add bypassed class when node is not bypassed", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.className).toBeUndefined();
  });

  it("sets dragHandle to node-drag-handle", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.dragHandle).toBe(".node-drag-handle");
  });

  it("preserves selectable from ui_properties", () => {
    const workflow = createMockWorkflow();
    const selectableNode: GraphNode = createMockGraphNode({
      ui_properties: { position: { x: 0, y: 0 }, selectable: false }
    });

    const result = graphNodeToReactFlowNode(workflow, selectableNode);

    expect(result.selectable).toBe(false);
    expect(result.data.selectable).toBe(false);
  });

  it("copies title from ui_properties to data", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.title).toBe("Test Node");
  });

  it("copies color from ui_properties to data", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.color).toBe("#ff0000");
  });

  it("sets zIndex to -10 for Loop nodes", () => {
    const workflow = createMockWorkflow();
    const loopNode: GraphNode = createMockGraphNode({
      type: "nodetool.group.Loop",
      ui_properties: { position: { x: 0, y: 0 } }
    });

    const result = graphNodeToReactFlowNode(workflow, loopNode);

    expect(result.zIndex).toBe(-10);
  });

  it("sets zIndex to -10 for Group nodes", () => {
    const workflow = createMockWorkflow();
    const groupNode: GraphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Group",
      ui_properties: { position: { x: 0, y: 0 } }
    });

    const result = graphNodeToReactFlowNode(workflow, groupNode);

    expect(result.zIndex).toBe(-10);
  });

  it("preserves custom zIndex from ui_properties for regular nodes", () => {
    const workflow = createMockWorkflow();
    const graphNode: GraphNode = createMockGraphNode({
      ui_properties: { position: { x: 0, y: 0 }, zIndex: 50 }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.zIndex).toBe(50);
  });

  it("stores originalType in data", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Preview"
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.originalType).toBe("nodetool.workflows.base_node.Preview");
  });

  it("initializes collapsed to false", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.collapsed).toBe(false);
  });

  it("initializes bypassed to false when not specified", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.bypassed).toBe(false);
  });

  it("copies dynamic_properties to data", () => {
    const workflow = createMockWorkflow();
    const graphNode: GraphNode = createMockGraphNode({
      dynamic_properties: { key1: "value1", key2: 42 }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.dynamic_properties).toEqual({ key1: "value1", key2: 42 });
  });

  it("copies dynamic_outputs to data", () => {
    const workflow = createMockWorkflow();
    const graphNode: GraphNode = createMockGraphNode({
      dynamic_outputs: { output1: { type: "text" } }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.dynamic_outputs).toEqual({ output1: { type: "text" } });
  });

  it("copies sync_mode to data", () => {
    const workflow = createMockWorkflow();
    const graphNode: GraphNode = createMockGraphNode({
      sync_mode: true
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.sync_mode).toBe(true);
  });

  it("uses default position when ui_properties position is not provided", () => {
    const workflow = createMockWorkflow();
    const graphNode: GraphNode = createMockGraphNode({
      ui_properties: { width: 200, height: 100 }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.position).toEqual({ x: 0, y: 0 });
  });

  it("handles nodes without ui_properties", () => {
    const workflow = createMockWorkflow();
    const graphNode: GraphNode = createMockGraphNode({
      ui_properties: undefined
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.position).toEqual({ x: 0, y: 0 });
    expect(result.style?.width).toBeDefined();
  });

  it("handles nodes with undefined data", () => {
    const workflow = createMockWorkflow();
    const graphNode: GraphNode = createMockGraphNode({
      data: undefined
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.properties).toEqual({});
  });
});
