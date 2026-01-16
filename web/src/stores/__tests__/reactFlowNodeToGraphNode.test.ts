import { reactFlowNodeToGraphNode } from "../reactFlowNodeToGraphNode";
import { Node } from "@xyflow/react";
import { NodeData } from "../NodeData";

jest.mock("../NodeStore", () => ({
  DEFAULT_NODE_WIDTH: 200,
  NodeUIProperties: {} as any
}));

jest.mock("@xyflow/react", () => ({
  Node: class Node {
    constructor() {}
  }
}));

describe("reactFlowNodeToGraphNode", () => {
  const createMockReactFlowNode = (overrides: Partial<Node<NodeData>> = {}): Node<NodeData> => ({
    id: "node-1",
    type: "test.node.Type",
    position: { x: 100, y: 200 },
    data: {
      properties: { prop1: "value1" },
      dynamic_properties: {},
      dynamic_outputs: {},
      collapsed: false,
      bypassed: false,
      workflow_id: "workflow-123",
      title: "Test Node",
      color: "#ff0000",
      selectable: true,
      originalType: "test.node.Type"
    },
    selected: false,
    dragHandle: ".node-drag-handle",
    zIndex: 0,
    ...overrides
  });

  it("converts a basic ReactFlow node to graph node", () => {
    const rfNode = createMockReactFlowNode();

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.id).toBe("node-1");
    expect(result.type).toBe("test.node.Type");
    expect(result.data).toEqual({ prop1: "value1" });
    expect(result.parent_id).toBeUndefined();
  });

  it("copies node id correctly", () => {
    const rfNode = createMockReactFlowNode({ id: "custom-id" });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.id).toBe("custom-id");
  });

  it("uses node.type as type, defaulting to empty string", () => {
    const rfNode = createMockReactFlowNode({ type: undefined });

    const result = reactFlowNodeToGraphNode(rfNode as Node<NodeData>);

    expect(result.type).toBe("");
  });

  it("copies position to ui_properties", () => {
    const rfNode = createMockReactFlowNode({
      position: { x: 150, y: 250 }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.position).toEqual({ x: 150, y: 250 });
  });

  it("copies selected state to ui_properties", () => {
    const rfNode = createMockReactFlowNode({ selected: true });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.selected).toBe(true);
  });

  it("copies zIndex to ui_properties, defaulting to 0", () => {
    const rfNode = createMockReactFlowNode({ zIndex: 50 });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.zIndex).toBe(50);
  });

  it("uses measured width when available", () => {
    const rfNode = createMockReactFlowNode({
      measured: { width: 300, height: 150 }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.width).toBe(300);
  });

  it("uses DEFAULT_NODE_WIDTH when measured width is not available", () => {
    const rfNode = createMockReactFlowNode({
      measured: undefined
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.width).toBeDefined();
    expect(result.ui_properties?.width).not.toBeUndefined();
  });

  it("copies title from data to ui_properties", () => {
    const rfNode = createMockReactFlowNode({
      data: {
        properties: {},
        dynamic_properties: {},
        dynamic_outputs: {},
        collapsed: false,
        bypassed: false,
        workflow_id: "workflow-123",
        title: "Custom Title",
        color: "#00ff00",
        selectable: true,
        originalType: "test.node.Type"
      }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.title).toBe("Custom Title");
  });

  it("copies color from data to ui_properties", () => {
    const rfNode = createMockReactFlowNode({
      data: {
        properties: {},
        dynamic_properties: {},
        dynamic_outputs: {},
        collapsed: false,
        bypassed: false,
        workflow_id: "workflow-123",
        title: "Test",
        color: "#abc123",
        selectable: true,
        originalType: "test.node.Type"
      }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.color).toBe("#abc123");
  });

  it("copies bypassed from data to ui_properties", () => {
    const rfNode = createMockReactFlowNode({
      data: {
        properties: {},
        dynamic_properties: {},
        dynamic_outputs: {},
        collapsed: false,
        bypassed: true,
        workflow_id: "workflow-123",
        title: "Test",
        color: "#000000",
        selectable: true,
        originalType: "test.node.Type"
      }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.bypassed).toBe(true);
  });

  it("defaults bypassed to false when not set", () => {
    const rfNode = createMockReactFlowNode({
      data: {
        properties: {},
        dynamic_properties: {},
        dynamic_outputs: {},
        collapsed: false,
        bypassed: false,
        workflow_id: "workflow-123",
        title: "Test",
        color: "#000000",
        selectable: true,
        originalType: "test.node.Type"
      }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.bypassed).toBe(false);
  });

  it("sets selectable to false for Loop nodes", () => {
    const rfNode = createMockReactFlowNode({
      type: "nodetool.group.Loop"
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.selectable).toBe(false);
  });

  it("uses measured height for Loop nodes", () => {
    const rfNode = createMockReactFlowNode({
      type: "nodetool.group.Loop",
      measured: { width: 300, height: 200 }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.height).toBe(200);
  });

  it("uses measured height for Comment nodes", () => {
    const rfNode = createMockReactFlowNode({
      type: "nodetool.workflows.base_node.Comment",
      measured: { width: 300, height: 150 }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.height).toBe(150);
  });

  it("uses measured height for Group nodes", () => {
    const rfNode = createMockReactFlowNode({
      type: "nodetool.workflows.base_node.Group",
      measured: { width: 300, height: 180 }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.height).toBe(180);
  });

  it("uses measured height for Preview nodes", () => {
    const rfNode = createMockReactFlowNode({
      type: "nodetool.workflows.base_node.Preview",
      measured: { width: 400, height: 300 }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.height).toBe(300);
  });

  it("does not set height for regular nodes from style", () => {
    const rfNode = createMockReactFlowNode({
      type: "test.node.Type",
      measured: { width: 300, height: 150 },
      style: { width: 300 }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.height).toBeUndefined();
  });

  it("reads height from style when it's a number", () => {
    const rfNode = createMockReactFlowNode({
      measured: { width: 300, height: 150 },
      style: { width: 300, height: 200 } as any
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.height).toBe(200);
  });

  it("copies parent_id from node", () => {
    const rfNode = createMockReactFlowNode({
      parentId: "parent-node-1"
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.parent_id).toBe("parent-node-1");
  });

  it("does not set parent_id when undefined", () => {
    const rfNode = createMockReactFlowNode({
      parentId: undefined
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.parent_id).toBeUndefined();
  });

  it("copies dynamic_properties from data", () => {
    const rfNode = createMockReactFlowNode({
      data: {
        properties: {},
        dynamic_properties: { key1: "value1" },
        dynamic_outputs: {},
        collapsed: false,
        bypassed: false,
        workflow_id: "workflow-123",
        title: "Test",
        color: "#000000",
        selectable: true,
        originalType: "test.node.Type"
      }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.dynamic_properties).toEqual({ key1: "value1" });
  });

  it("defaults dynamic_properties to empty object", () => {
    const rfNode = createMockReactFlowNode({
      data: {
        properties: {},
        dynamic_properties: undefined,
        dynamic_outputs: {},
        collapsed: false,
        bypassed: false,
        workflow_id: "workflow-123",
        title: "Test",
        color: "#000000",
        selectable: true,
        originalType: "test.node.Type"
      }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.dynamic_properties).toEqual({});
  });

  it("copies dynamic_outputs from data", () => {
    const rfNode = createMockReactFlowNode({
      data: {
        properties: {},
        dynamic_properties: {},
        dynamic_outputs: { output1: { type: "text" } },
        collapsed: false,
        bypassed: false,
        workflow_id: "workflow-123",
        title: "Test",
        color: "#000000",
        selectable: true,
        originalType: "test.node.Type"
      }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.dynamic_outputs).toEqual({ output1: { type: "text" } });
  });

  it("defaults dynamic_outputs to empty object", () => {
    const rfNode = createMockReactFlowNode({
      data: {
        properties: {},
        dynamic_properties: {},
        dynamic_outputs: undefined,
        collapsed: false,
        bypassed: false,
        workflow_id: "workflow-123",
        title: "Test",
        color: "#000000",
        selectable: true,
        originalType: "test.node.Type"
      }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.dynamic_outputs).toEqual({});
  });

  it("copies sync_mode from data, defaulting to on_any", () => {
    const rfNode = createMockReactFlowNode({
      data: {
        properties: {},
        dynamic_properties: {},
        dynamic_outputs: {},
        collapsed: false,
        bypassed: false,
        workflow_id: "workflow-123",
        title: "Test",
        color: "#000000",
        selectable: true,
        originalType: "test.node.Type",
        sync_mode: "manual"
      }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.sync_mode).toBe("manual");
  });

  it("defaults sync_mode to on_any", () => {
    const rfNode = createMockReactFlowNode({
      data: {
        properties: {},
        dynamic_properties: {},
        dynamic_outputs: {},
        collapsed: false,
        bypassed: false,
        workflow_id: "workflow-123",
        title: "Test",
        color: "#000000",
        selectable: true,
        originalType: "test.node.Type",
        sync_mode: undefined
      }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.sync_mode).toBe("on_any");
  });

  it("copies properties from data", () => {
    const rfNode = createMockReactFlowNode({
      data: {
        properties: { myProp: "myValue" },
        dynamic_properties: {},
        dynamic_outputs: {},
        collapsed: false,
        bypassed: false,
        workflow_id: "workflow-123",
        title: "Test",
        color: "#000000",
        selectable: true,
        originalType: "test.node.Type"
      }
    });

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.data).toEqual({ myProp: "myValue" });
  });

  it("throws error when accessing title from nodes without data", () => {
    const rfNode = createMockReactFlowNode({
      data: undefined
    } as any);

    expect(() => reactFlowNodeToGraphNode(rfNode as Node<NodeData>)).toThrow();
  });

  it("sets selectable to true by default in ui_properties", () => {
    const rfNode = createMockReactFlowNode();

    const result = reactFlowNodeToGraphNode(rfNode);

    expect(result.ui_properties?.selectable).toBe(true);
  });
});
