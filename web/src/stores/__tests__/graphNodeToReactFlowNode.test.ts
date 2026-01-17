jest.mock("../../components/node_types/PlaceholderNode", () => () => null);

import { graphNodeToReactFlowNode } from "../graphNodeToReactFlowNode";
import { Workflow, Node as GraphNode } from "../ApiTypes";

describe("graphNodeToReactFlowNode", () => {
  const createMockWorkflow = (): Workflow => ({
    id: "workflow-123",
    name: "Test Workflow",
    graph: { nodes: [], edges: [] },
    engine: "mem",
  } as unknown as Workflow);

  const createMockGraphNode = (overrides: Partial<GraphNode> = {}): GraphNode => ({
    id: "node-1",
    type: "nodetool.text.Prompt",
    data: { text: "Hello" },
    parent_id: undefined,
    ui_properties: undefined,
    dynamic_properties: {},
    dynamic_outputs: {},
    sync_mode: "on_any",
    ...overrides,
  });

  it("converts a basic graph node to ReactFlow node", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.id).toBe("node-1");
    expect(result.type).toBe("nodetool.text.Prompt");
    expect(result.data.properties).toEqual({ text: "Hello" });
    expect(result.data.workflow_id).toBe("workflow-123");
    expect(result.position).toEqual({ x: 0, y: 0 });
  });

  it("preserves parent_id as parentId", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({ parent_id: "parent-node" });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.parentId).toBe("parent-node");
  });

  it("applies ui_properties for position", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: { position: { x: 100, y: 200 } },
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.position).toEqual({ x: 100, y: 200 });
  });

  it("sets default width for standard nodes", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.style?.width).toBeDefined();
  });

  it("sets width 400 and height 300 for Preview nodes without dimensions", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Preview",
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.style?.width).toBe(400);
    expect(result.style?.height).toBe(300);
  });

  it("preserves Preview node dimensions if already set", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Preview",
      ui_properties: { width: 500, height: 400 },
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.style?.width).toBe(500);
    expect(result.style?.height).toBe(400);
  });

  it("sets width 450 and height 350 for CompareImages nodes without dimensions", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.compare.CompareImages",
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.style?.width).toBe(450);
    expect(result.style?.height).toBe(350);
  });

  it("handles bypassed nodes with bypassed class", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: { bypassed: true },
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.className).toBe("bypassed");
    expect(result.data.bypassed).toBe(true);
  });

  it("sets expandParent to false for Loop nodes", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.group.Loop",
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.expandParent).toBe(false);
  });

  it("sets expandParent to false for Comment nodes", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Comment",
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.expandParent).toBe(false);
  });

  it("sets expandParent to false for Group nodes", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Group",
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.expandParent).toBe(false);
  });

  it("sets expandParent to true for regular nodes", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.expandParent).toBe(true);
  });

  it("preserves ui_properties title", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: { title: "My Node" },
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.title).toBe("My Node");
  });

  it("preserves ui_properties color", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: { color: "#ff0000" },
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.color).toBe("#ff0000");
  });

  it("copies dynamic_properties to node data", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      dynamic_properties: { custom_prop: "value" },
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.dynamic_properties).toEqual({ custom_prop: "value" });
  });

  it("copies dynamic_outputs to node data", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      dynamic_outputs: { custom_output: { type: "text", optional: false, type_args: [] } as any },
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.dynamic_outputs).toHaveProperty("custom_output");
  });

  it("copies sync_mode to node data", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      sync_mode: "on_all",
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.sync_mode).toBe("on_all");
  });

  it("sets collapsed to false by default", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.collapsed).toBe(false);
  });

  it("applies zIndex for non-group nodes from ui_properties", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: { zIndex: 100 },
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.zIndex).toBe(100);
  });

  it("sets zIndex to -10 for Loop nodes", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.group.Loop",
      ui_properties: { zIndex: 100 },
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.zIndex).toBe(-10);
  });

  it("sets zIndex to -10 for Group nodes", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Group",
      ui_properties: { zIndex: 100 },
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.zIndex).toBe(-10);
  });

  it("preserves selectable from ui_properties", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: { selectable: false },
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.selectable).toBe(false);
  });

  it("sets dragHandle to node-drag-handle class", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.dragHandle).toBe(".node-drag-handle");
  });

  it("sets originalType to node type", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.text.Prompt",
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.originalType).toBe("nodetool.text.Prompt");
  });

  it("handles undefined data gracefully", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      data: undefined as any,
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.properties).toEqual({});
    expect(result.data.dynamic_properties).toEqual({});
    expect(result.data.dynamic_outputs).toEqual({});
  });

  it("handles empty object data", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      data: {} as any,
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.properties).toEqual({});
  });

  it("handles undefined ui_properties", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: undefined,
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.position).toEqual({ x: 0, y: 0 });
    expect(result.selectable).toBeUndefined();
    expect(result.className).toBeUndefined();
    expect(result.zIndex).toBeUndefined();
  });
});
