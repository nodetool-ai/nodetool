jest.mock("../../components/node_types/PlaceholderNode", () => () => null);
jest.mock("../NodeStore", () => ({
  DEFAULT_NODE_WIDTH: 200,
}));

import { graphNodeToReactFlowNode } from "../graphNodeToReactFlowNode";
import { Workflow, Node as GraphNode } from "../ApiTypes";
import { DEFAULT_NODE_WIDTH } from "../nodeUiDefaults";

describe("graphNodeToReactFlowNode", () => {
  const createMockWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
    id: "workflow-123",
    name: "Test Workflow",
    graph: { nodes: [], edges: [] },
    engine: "mem",
    ...overrides,
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

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation((..._args: unknown[]) => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it("converts a basic node with required fields", () => {
    const workflow = createMockWorkflow();
    const node = createMockGraphNode();

    const result = graphNodeToReactFlowNode(workflow, node);

    expect(result.id).toBe("node-1");
    expect(result.type).toBe("nodetool.text.Prompt");
    expect(result.parentId).toBeUndefined();
    expect(result.dragHandle).toBe(".node-drag-handle");
    expect(result.selectable).toBeUndefined();
    expect(result.className).toBeUndefined();
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

  describe("data conversion", () => {
    it("maps node data to properties in result", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ data: { testProp: "testValue" } });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.properties).toEqual({ testProp: "testValue" });
    });

    it("maps empty data to empty object", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ data: undefined });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.properties).toEqual({});
    });

    it("maps dynamic_properties to result", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        dynamic_properties: { dynamicProp: "value" },
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.dynamic_properties).toEqual({ dynamicProp: "value" });
    });

    it("maps dynamic_outputs to result", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        dynamic_outputs: { output1: { type: "text" } } as any,
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.dynamic_outputs).toEqual({ output1: { type: "text" } });
    });

    it("maps sync_mode to result", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ sync_mode: "on_change" });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.sync_mode).toBe("on_change");
    });

    it("sets workflow_id in result data", () => {
      const workflow = createMockWorkflow({ id: "my-workflow-id" });
      const node = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.workflow_id).toBe("my-workflow-id");
    });
  });

  describe("title and color from ui_properties", () => {
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

    it("does not set title when ui_properties is undefined", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.title).toBeUndefined();
    });

    it("does not set color when ui_properties is undefined", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.color).toBeUndefined();
    });
  });

  describe("selectable property", () => {
    it("preserves selectable from ui_properties", () => {
      const workflow = createMockWorkflow();
      const graphNode = createMockGraphNode({
        ui_properties: { selectable: false },
      });

      const result = graphNodeToReactFlowNode(workflow, graphNode);

      expect(result.selectable).toBe(false);
    });

    it("sets selectable to undefined when not in ui_properties", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.selectable).toBeUndefined();
    });
  });

  describe("bypassed property", () => {
    it("handles bypassed nodes with bypassed class", () => {
      const workflow = createMockWorkflow();
      const graphNode = createMockGraphNode({
        ui_properties: { bypassed: true },
      });

      const result = graphNodeToReactFlowNode(workflow, graphNode);

      expect(result.className).toBe("bypassed");
      expect(result.data.bypassed).toBe(true);
    });

    it("does not set bypassed class when ui_properties.bypassed is false", () => {
      const workflow = createMockWorkflow();
      const graphNode = createMockGraphNode({
        ui_properties: { bypassed: false },
      });

      const result = graphNodeToReactFlowNode(workflow, graphNode);

      expect(result.className).toBeUndefined();
      expect(result.data.bypassed).toBe(false);
    });

    it("defaults bypassed to false when not in ui_properties", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.bypassed).toBe(false);
    });
  });

  describe("collapsed property", () => {
    it("sets collapsed to false by default", () => {
      const workflow = createMockWorkflow();
      const graphNode = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, graphNode);

      expect(result.data.collapsed).toBe(false);
    });
  });

  describe("originalType property", () => {
    it("sets originalType to node type", () => {
      const workflow = createMockWorkflow();
      const graphNode = createMockGraphNode({
        type: "nodetool.text.Prompt",
      });

      const result = graphNodeToReactFlowNode(workflow, graphNode);

      expect(result.data.originalType).toBe("nodetool.text.Prompt");
    });
  });

  describe("size dimensions", () => {
    it("uses width from ui_properties", () => {
      const workflow = createMockWorkflow();
      const graphNode = createMockGraphNode({
        ui_properties: { width: 300, height: 150 },
      });

      const result = graphNodeToReactFlowNode(workflow, graphNode);

      expect(result.style?.width).toBe(300);
      expect(result.style?.height).toBe(150);
    });

    it("uses DEFAULT_NODE_WIDTH when ui_properties.width is undefined", () => {
      const workflow = createMockWorkflow();
      const graphGraphNode = createMockGraphNode({
        ui_properties: { width: undefined, height: 100 },
      });

      const result = graphNodeToReactFlowNode(workflow, graphGraphNode);

      expect(result.style?.width).toBe(DEFAULT_NODE_WIDTH);
    });

    it("uses DEFAULT_NODE_WIDTH when ui_properties is undefined", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.style?.width).toBe(DEFAULT_NODE_WIDTH);
    });
  });

  describe("Preview node special handling", () => {
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
  });

  describe("CompareImages node special handling", () => {
    it("sets width 450 and height 350 for CompareImages nodes without dimensions", () => {
      const workflow = createMockWorkflow();
      const graphNode = createMockGraphNode({
        type: "nodetool.compare.CompareImages",
      });

      const result = graphNodeToReactFlowNode(workflow, graphNode);

      expect(result.style?.width).toBe(450);
      expect(result.style?.height).toBe(350);
    });
  });

  describe("expandParent property", () => {
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
  });

  describe("zIndex property", () => {
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

    it("applies zIndex for non-group nodes from ui_properties", () => {
      const workflow = createMockWorkflow();
      const graphNode = createMockGraphNode({
        ui_properties: { zIndex: 100 },
      });

      const result = graphNodeToReactFlowNode(workflow, graphNode);

      expect(result.zIndex).toBe(100);
    });
  });

  describe("edge cases", () => {
    it("sets dragHandle to node-drag-handle class", () => {
      const workflow = createMockWorkflow();
      const graphNode = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, graphNode);

      expect(result.dragHandle).toBe(".node-drag-handle");
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

    it("uses default position when ui_properties is undefined", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.position).toEqual({ x: 0, y: 0 });
    });
  });
});
