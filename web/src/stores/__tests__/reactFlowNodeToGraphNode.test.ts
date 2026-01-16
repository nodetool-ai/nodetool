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

import { reactFlowNodeToGraphNode } from "../reactFlowNodeToGraphNode";

const createMockReactFlowNode = (overrides: Partial<import("@xyflow/react").Node<import("../NodeData").NodeData>> = {}): import("@xyflow/react").Node<import("../NodeData").NodeData> => ({
  id: "node-1",
  type: "test-node",
  position: { x: 100, y: 200 },
  data: {
    properties: { test: "value" },
    dynamic_properties: {},
    dynamic_outputs: {},
    selectable: true,
    workflow_id: "workflow-1",
    collapsed: false,
    bypassed: false,
    originalType: "test-node"
  },
  selected: true,
  zIndex: 5,
  ...overrides
});

describe("reactFlowNodeToGraphNode", () => {
  it("converts basic ReactFlow node to graph node", () => {
    const reactFlowNode = createMockReactFlowNode();

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.id).toBe("node-1");
    expect(result.type).toBe("test-node");
    expect(result.data).toEqual({ test: "value" });
  });

  it("maps ui_properties with correct structure", () => {
    const reactFlowNode = createMockReactFlowNode({
      position: { x: 150, y: 250 },
      selected: false,
      zIndex: 10
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.ui_properties).toEqual({
      selected: false,
      position: { x: 150, y: 250 },
      zIndex: 10,
      width: 280,
      height: undefined,
      title: undefined,
      color: undefined,
      selectable: true,
      bypassed: false
    });
  });

  it("uses measured width when available", () => {
    const reactFlowNode = createMockReactFlowNode({
      measured: { width: 250, height: 120 }
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect((result.ui_properties as any).width).toBe(250);
  });

  it("maps parent_id when present", () => {
    const reactFlowNode = createMockReactFlowNode({
      parentId: "parent-node"
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.parent_id).toBe("parent-node");
  });

  it("maps dynamic_properties and dynamic_outputs", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: {
        ...createMockReactFlowNode().data,
        dynamic_properties: { prop1: "value" },
        dynamic_outputs: { output1: { type: "str", optional: false, values: null, type_args: [] } }
      }
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.dynamic_properties).toEqual({ prop1: "value" });
    expect(result.dynamic_outputs).toEqual({ output1: { type: "str", optional: false, values: null, type_args: [] } });
  });

  it("defaults sync_mode to on_any", () => {
    const reactFlowNode = createMockReactFlowNode();

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.sync_mode).toBe("on_any");
  });

  it("uses data.sync_mode when present", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: {
        ...createMockReactFlowNode().data,
        sync_mode: "on_all"
      }
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.sync_mode).toBe("on_all");
  });

  it("handles explicit height from style", () => {
    const reactFlowNode = createMockReactFlowNode({
      style: { height: 200 } as any,
      measured: { width: 180, height: 100 }
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect((result.ui_properties as any).height).toBe(200);
  });

  it("sets selectable to false for Loop nodes", () => {
    const reactFlowNode = createMockReactFlowNode({
      type: "nodetool.group.Loop",
      measured: { width: 300, height: 200 }
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect((result.ui_properties as any).selectable).toBe(false);
    expect((result.ui_properties as any).height).toBe(200);
  });

  it("sets height for Comment, Group, and Preview nodes", () => {
    const reactFlowNode = createMockReactFlowNode({
      type: "nodetool.workflows.base_node.Comment",
      measured: { width: 200, height: 150 }
    });
    const result = reactFlowNodeToGraphNode(reactFlowNode);
    expect((result.ui_properties as any).height).toBe(150);
  });

  it("maps title from node data", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: {
        ...createMockReactFlowNode().data,
        title: "My Node Title"
      }
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect((result.ui_properties as any).title).toBe("My Node Title");
  });

  it("maps color from node data", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: {
        ...createMockReactFlowNode().data,
        color: "#ff5500"
      }
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect((result.ui_properties as any).color).toBe("#ff5500");
  });

  it("maps bypassed from node data", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: {
        ...createMockReactFlowNode().data,
        bypassed: true
      }
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect((result.ui_properties as any).bypassed).toBe(true);
  });

  it("handles missing data.properties gracefully", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: {
        ...createMockReactFlowNode().data,
        properties: undefined
      }
    } as any);

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.data).toBeUndefined();
  });

  it("handles empty string type", () => {
    const reactFlowNode = createMockReactFlowNode({
      type: ""
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.type).toBe("");
  });

  it("defaults zIndex to 0 when not present", () => {
    const reactFlowNode = createMockReactFlowNode({
      zIndex: undefined
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect((result.ui_properties as any).zIndex).toBe(0);
  });
});
