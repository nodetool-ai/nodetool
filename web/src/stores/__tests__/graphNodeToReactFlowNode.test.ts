// Mock NodeStore to avoid complex dependency chain
jest.mock("../NodeStore", () => ({
  DEFAULT_NODE_WIDTH: 200,
  NodeUIProperties: {
    selected: false,
    position: { x: 0, y: 0 },
    zIndex: 0,
    width: 200,
    height: undefined,
    title: undefined,
    color: undefined,
    selectable: true,
    bypassed: false,
  },
}));

import { graphNodeToReactFlowNode } from "../graphNodeToReactFlowNode";
import { Workflow, Node as GraphNode } from "../ApiTypes";
import { DEFAULT_NODE_WIDTH } from "../NodeStore";

interface MockUIProperties {
  selected?: boolean;
  position?: { x: number; y: number };
  zIndex?: number;
  width?: number;
  height?: number | undefined;
  title?: string;
  color?: string;
  selectable?: boolean;
  bypassed?: boolean;
}

describe("graphNodeToReactFlowNode", () => {
  const createMockWorkflow = (): Workflow => ({
    id: "workflow-1",
    name: "Test Workflow",
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    description: "",
    tags: [],
    graph: { nodes: [], edges: [] },
  });

  const createMockGraphNode = (overrides: Partial<GraphNode> = {}): GraphNode => ({
    id: "node-1",
    type: "nodetool.input.StringInput",
    data: { value: "test" },
    parent_id: undefined,
    ui_properties: undefined,
    dynamic_properties: {},
    dynamic_outputs: {},
    sync_mode: "on_any",
    ...overrides,
  });

  const createMockUIProperties = (overrides: Partial<MockUIProperties> = {}): MockUIProperties => ({
    selected: false,
    position: { x: 100, y: 200 },
    zIndex: 1,
    width: 200,
    height: 100,
    title: "Test Node",
    color: "#ff0000",
    selectable: true,
    bypassed: false,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation((..._args: unknown[]) => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("basic conversion", () => {
    it("converts a basic node with required fields", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.id).toBe("node-1");
      expect(result.type).toBe("nodetool.input.StringInput");
      expect(result.parentId).toBeUndefined();
      expect(result.dragHandle).toBe(".node-drag-handle");
      expect(result.selectable).toBeUndefined();
      expect(result.className).toBeUndefined();
    });

    it("converts node with parent_id to parentId", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ parent_id: "parent-node" });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.parentId).toBe("parent-node");
    });

    it("copies position from ui_properties", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        ui_properties: createMockUIProperties({ position: { x: 150, y: 250 } }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.position).toEqual({ x: 150, y: 250 });
    });

    it("uses default position when ui_properties is undefined", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.position).toEqual({ x: 0, y: 0 });
    });
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
    it("maps title from ui_properties", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        ui_properties: createMockUIProperties({ title: "My Node Title" }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.title).toBe("My Node Title");
    });

    it("maps color from ui_properties", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        ui_properties: createMockUIProperties({ color: "#00ff00" }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.color).toBe("#00ff00");
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
    it("sets selectable from ui_properties when present", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        ui_properties: createMockUIProperties({ selectable: false }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.selectable).toBe(false);
      expect(result.data.selectable).toBe(false);
    });

    it("sets selectable to undefined when not in ui_properties", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.selectable).toBeUndefined();
    });
  });

  describe("bypassed property", () => {
    it("sets bypassed class when ui_properties.bypassed is true", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        ui_properties: createMockUIProperties({ bypassed: true }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.className).toBe("bypassed");
      expect(result.data.bypassed).toBe(true);
    });

    it("does not set bypassed class when ui_properties.bypassed is false", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        ui_properties: createMockUIProperties({ bypassed: false }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

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
    it("always sets collapsed to false", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode();

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.collapsed).toBe(false);
    });
  });

  describe("originalType property", () => {
    it("stores original node type", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ type: "nodetool.input.StringInput" });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.data.originalType).toBe("nodetool.input.StringInput");
    });
  });

  describe("size dimensions", () => {
    it("uses width from ui_properties", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        ui_properties: createMockUIProperties({ width: 300, height: 150 }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.style?.width).toBe(300);
      expect(result.style?.height).toBe(150);
    });

    it("uses DEFAULT_NODE_WIDTH when ui_properties.width is undefined", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        ui_properties: createMockUIProperties({ width: undefined, height: 100 }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

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
    it("sets default width to 400 for Preview nodes without width", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        type: "nodetool.workflows.base_node.Preview",
        ui_properties: createMockUIProperties({ width: undefined, height: undefined }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.style?.width).toBe(400);
      expect(result.style?.height).toBe(300);
    });

    it("uses custom width for Preview nodes when provided", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        type: "nodetool.workflows.base_node.Preview",
        ui_properties: createMockUIProperties({ width: 500, height: 400 }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.style?.width).toBe(500);
      expect(result.style?.height).toBe(400);
    });
  });

  describe("CompareImages node special handling", () => {
    it("sets default width to 450 for CompareImages nodes without width", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        type: "nodetool.compare.CompareImages",
        ui_properties: createMockUIProperties({ width: undefined, height: undefined }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.style?.width).toBe(450);
      expect(result.style?.height).toBe(350);
    });

    it("uses custom width for CompareImages nodes when provided", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        type: "nodetool.compare.CompareImages",
        ui_properties: createMockUIProperties({ width: 600, height: 500 }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.style?.width).toBe(600);
      expect(result.style?.height).toBe(500);
    });
  });

  describe("expandParent property", () => {
    it("sets expandParent to false for Loop nodes", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ type: "nodetool.group.Loop" });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.expandParent).toBe(false);
    });

    it("sets expandParent to false for Comment nodes", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ type: "nodetool.workflows.base_node.Comment" });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.expandParent).toBe(false);
    });

    it("sets expandParent to false for Group nodes", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ type: "nodetool.workflows.base_node.Group" });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.expandParent).toBe(false);
    });

    it("sets expandParent to true for regular nodes", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ type: "nodetool.input.StringInput" });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.expandParent).toBe(true);
    });
  });

  describe("zIndex property", () => {
    it("sets zIndex to -10 for Loop nodes", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ type: "nodetool.group.Loop" });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.zIndex).toBe(-10);
    });

    it("sets zIndex to -10 for Group nodes", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ type: "nodetool.workflows.base_node.Group" });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.zIndex).toBe(-10);
    });

    it("uses ui_properties.zIndex for regular nodes", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        ui_properties: createMockUIProperties({ zIndex: 5 }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.zIndex).toBe(5);
    });

    it("uses ui_properties.zIndex for Preview nodes", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({
        type: "nodetool.workflows.base_node.Preview",
        ui_properties: createMockUIProperties({ zIndex: 10 }),
      });

      const result = graphNodeToReactFlowNode(workflow, node);

      expect(result.zIndex).toBe(10);
    });
  });

  describe("stale workflow_id warning", () => {
    it("logs warning when node data contains any workflow_id", () => {
      const workflow = createMockWorkflow({ id: "new-workflow-id" });
      const node = createMockGraphNode({
        data: { workflow_id: "old-workflow-id" } as any,
      });

      graphNodeToReactFlowNode(workflow, node);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Node node-1 has stale workflow_id in data:"),
        "old-workflow-id",
        "will use:",
        "new-workflow-id"
      );
    });

    it("logs warning even when workflow_id matches", () => {
      const workflow = createMockWorkflow({ id: "workflow-1" });
      const node = createMockGraphNode({
        data: { workflow_id: "workflow-1" } as any,
      });

      graphNodeToReactFlowNode(workflow, node);

      // Warning is logged whenever workflow_id exists in data
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Node node-1 has stale workflow_id in data:"),
        "workflow-1",
        "will use:",
        "workflow-1"
      );
    });

    it("does not log warning when no workflow_id in data", () => {
      const workflow = createMockWorkflow();
      const node = createMockGraphNode({ data: { value: "test" } });

      graphNodeToReactFlowNode(workflow, node);

      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
