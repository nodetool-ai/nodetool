jest.mock("../../components/node_types/PlaceholderNode", () => () => null);
jest.mock("@xyflow/react", () => ({
  Node: class Node {},
  Edge: class Edge {},
  Position: {
    Left: "left",
    Right: "right",
    Top: "top",
    Bottom: "bottom"
  }
}));

import { graphNodeToReactFlowNode } from "../graphNodeToReactFlowNode";

const createMockWorkflow = () => ({
  id: "workflow-1",
  name: "Test Workflow",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  access: "private",
  description: "",
  tags: [],
  thumbnail: null,
  nodes: [],
  edges: [],
  ui_state: {},
  graph: { nodes: [], edges: [] },
  is_public: false,
  tool_name: null,
  required_models: null,
  metadata: {}
} as any);

const createMockGraphNode = (overrides: Partial<import("../ApiTypes").Node> = {}): import("../ApiTypes").Node => ({
  id: "node-1",
  type: "test-node",
  data: { test: "value" },
  ui_properties: {
    position: { x: 100, y: 200 },
    width: 200,
    height: 100,
    title: "Test Node",
    color: "#ff0000",
    selectable: true,
    bypassed: false,
    zIndex: 5
  },
  parent_id: undefined,
  dynamic_properties: {},
  dynamic_outputs: {},
  sync_mode: "on_any",
  ...overrides
});

describe("graphNodeToReactFlowNode", () => {
  it("converts basic graph node to ReactFlow node", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.id).toBe("node-1");
    expect(result.type).toBe("test-node");
    expect(result.position).toEqual({ x: 100, y: 200 });
    expect(result.data.properties).toEqual({ test: "value" });
    expect(result.data.workflow_id).toBe("workflow-1");
  });

  it("uses default position when ui_properties is missing", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({ ui_properties: undefined });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.position).toEqual({ x: 0, y: 0 });
  });

  it("sets correct parent_id when present", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({ parent_id: "parent-node" });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.parentId).toBe("parent-node");
  });

  it("sets default width for standard nodes", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({ ui_properties: { position: { x: 0, y: 0 } } });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.style?.width).toBe(280);
  });

  it("sets default width for Preview node", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Preview",
      ui_properties: { position: { x: 0, y: 0 } }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.style?.width).toBe(400);
    expect(result.style?.height).toBe(300);
  });

  it("sets default dimensions for CompareImages node", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "nodetool.compare.CompareImages",
      ui_properties: { position: { x: 0, y: 0 } }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.style?.width).toBe(450);
    expect(result.style?.height).toBe(350);
  });

  it("preserves custom width and height from ui_properties", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: {
        position: { x: 0, y: 0 },
        width: 300,
        height: 150
      }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.style?.width).toBe(300);
    expect(result.style?.height).toBe(150);
  });

  it("applies bypassed class when node is bypassed", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: { position: { x: 0, y: 0 }, bypassed: true }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.className).toBe("bypassed");
    expect(result.data.bypassed).toBe(true);
  });

  it("does not apply bypassed class when node is not bypassed", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: { position: { x: 0, y: 0 }, bypassed: false }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.className).toBeUndefined();
    expect(result.data.bypassed).toBe(false);
  });

  it("sets correct zIndex for Loop and Group nodes", () => {
    const workflow = createMockWorkflow();

    const loopNode = createMockGraphNode({
      type: "nodetool.group.Loop",
      ui_properties: { position: { x: 0, y: 0 }, zIndex: 10 }
    });
    const loopResult = graphNodeToReactFlowNode(workflow, loopNode);
    expect(loopResult.zIndex).toBe(-10);

    const groupNode = createMockGraphNode({
      type: "nodetool.workflows.base_node.Group",
      ui_properties: { position: { x: 0, y: 0 }, zIndex: 10 }
    });
    const groupResult = graphNodeToReactFlowNode(workflow, groupNode);
    expect(groupResult.zIndex).toBe(-10);
  });

  it("preserves custom zIndex for regular nodes", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      type: "test-node",
      ui_properties: { position: { x: 0, y: 0 }, zIndex: 42 }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.zIndex).toBe(42);
  });

  it("sets dragHandle to node-drag-handle", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.dragHandle).toBe(".node-drag-handle");
  });

  it("sets expandParent correctly for different node types", () => {
    const workflow = createMockWorkflow();

    const loopNode = createMockGraphNode({ type: "nodetool.group.Loop" });
    expect(graphNodeToReactFlowNode(workflow, loopNode).expandParent).toBe(false);

    const commentNode = createMockGraphNode({ type: "nodetool.workflows.base_node.Comment" });
    expect(graphNodeToReactFlowNode(workflow, commentNode).expandParent).toBe(false);

    const groupNode = createMockGraphNode({ type: "nodetool.workflows.base_node.Group" });
    expect(graphNodeToReactFlowNode(workflow, groupNode).expandParent).toBe(false);

    const regularNode = createMockGraphNode({ type: "test-node" });
    expect(graphNodeToReactFlowNode(workflow, regularNode).expandParent).toBe(true);
  });

  it("maps dynamic_properties and dynamic_outputs", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      dynamic_properties: { prop1: "value" },
      dynamic_outputs: { output1: { type: "str", optional: false, values: null, type_args: [] } }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.dynamic_properties).toEqual({ prop1: "value" });
    expect(result.data.dynamic_outputs).toEqual({ output1: { type: "str", optional: false, values: null, type_args: [] } });
  });

  it("maps sync_mode", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({ sync_mode: "on_all" });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.sync_mode).toBe("on_all");
  });

  it("maps title and color from ui_properties", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({
      ui_properties: {
        position: { x: 0, y: 0 },
        title: "My Node",
        color: "#00ff00"
      }
    });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.title).toBe("My Node");
    expect(result.data.color).toBe("#00ff00");
  });

  it("maps originalType", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode({ type: "test-node" });

    const result = graphNodeToReactFlowNode(workflow, graphNode);

    expect(result.data.originalType).toBe("test-node");
  });
});
