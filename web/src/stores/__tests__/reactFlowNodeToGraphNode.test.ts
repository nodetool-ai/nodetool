jest.mock("../../components/node_types/PlaceholderNode", () => () => null);

import { reactFlowNodeToGraphNode } from "../reactFlowNodeToGraphNode";
import { Node } from "@xyflow/react";
import { NodeData } from "../NodeData";
import { Node as GraphNode } from "../ApiTypes";
import { NodeUIProperties } from "../NodeStore";

describe("reactFlowNodeToGraphNode", () => {
  const createMockNodeData = (overrides: Partial<NodeData> = {}): NodeData => ({
    properties: { text: "Hello" },
    dynamic_properties: {},
    dynamic_outputs: {},
    sync_mode: "on_any",
    selectable: true,
    collapsed: false,
    bypassed: false,
    workflow_id: "workflow-123",
    title: "My Node",
    color: "#ff0000",
    originalType: "nodetool.text.Prompt",
    ...overrides,
  });

  const createMockReactFlowNode = (overrides: Partial<Node<NodeData>> = {}): Node<NodeData> => ({
    id: "node-1",
    type: "nodetool.text.Prompt",
    position: { x: 100, y: 200 },
    data: createMockNodeData(),
    selected: false,
    dragHandle: ".node-drag-handle",
    zIndex: 10,
    parentId: undefined,
    ...overrides,
  });

  const getUiProperties = (result: GraphNode): NodeUIProperties | undefined => {
    return result.ui_properties as NodeUIProperties | undefined;
  };

  it("converts a basic ReactFlow node to graph node", () => {
    const reactFlowNode = createMockReactFlowNode();

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.id).toBe("node-1");
    expect(result.type).toBe("nodetool.text.Prompt");
    expect(result.data).toEqual({ text: "Hello" });
  });

  it("preserves parent_id from parentId", () => {
    const reactFlowNode = createMockReactFlowNode({
      parentId: "parent-node",
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.parent_id).toBe("parent-node");
  });

  it("copies properties from node data", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: createMockNodeData({
        properties: { text: "Test", count: 42 },
      }),
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.data).toEqual({ text: "Test", count: 42 });
  });

  it("copies dynamic_properties from node data", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: createMockNodeData({
        dynamic_properties: { custom: "value" },
      }),
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.dynamic_properties).toEqual({ custom: "value" });
  });

  it("copies dynamic_outputs from node data", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: createMockNodeData({
        dynamic_outputs: { output: { type: "text", optional: false, type_args: [] } as any },
      }),
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.dynamic_outputs).toHaveProperty("output");
  });

  it("copies sync_mode from node data with default", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: createMockNodeData({
        sync_mode: "on_all",
      }),
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.sync_mode).toBe("on_all");
  });

  it("uses on_any as default sync_mode", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: createMockNodeData({
        sync_mode: undefined as any,
      }),
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.sync_mode).toBe("on_any");
  });

  it("creates ui_properties with selected state", () => {
    const reactFlowNode = createMockReactFlowNode({
      selected: true,
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect((result as unknown as { ui_properties: NodeUIProperties }).ui_properties?.selected).toBe(true);
  });

  it("creates ui_properties with position", () => {
    const reactFlowNode = createMockReactFlowNode({
      position: { x: 150, y: 250 },
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.position).toEqual({ x: 150, y: 250 });
  });

  it("creates ui_properties with zIndex", () => {
    const reactFlowNode = createMockReactFlowNode({
      zIndex: 50,
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.zIndex).toBe(50);
  });

  it("uses measured width for ui_properties", () => {
    const reactFlowNode = createMockReactFlowNode({
      measured: { width: 300, height: 200 },
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.width).toBe(300);
  });

  it("creates ui_properties with title from node data", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: createMockNodeData({
        title: "Custom Title",
      }),
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.title).toBe("Custom Title");
  });

  it("creates ui_properties with color from node data", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: createMockNodeData({
        color: "#00ff00",
      }),
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.color).toBe("#00ff00");
  });

  it("creates ui_properties with selectable true by default", () => {
    const reactFlowNode = createMockReactFlowNode();

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.selectable).toBe(true);
  });

  it("creates ui_properties with bypassed from node data", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: createMockNodeData({
        bypassed: true,
      }),
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.bypassed).toBe(true);
  });

  it("applies explicit height from node.style for vertical resize", () => {
    const reactFlowNode = createMockReactFlowNode({
      style: { width: 200, height: 150 } as any,
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.height).toBe(150);
  });

  it("sets Loop nodes as not selectable", () => {
    const reactFlowNode = createMockReactFlowNode({
      type: "nodetool.group.Loop",
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.selectable).toBe(false);
  });

  it("sets Loop nodes height from measured", () => {
    const reactFlowNode = createMockReactFlowNode({
      type: "nodetool.group.Loop",
      measured: { width: 200, height: 150 },
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.height).toBe(150);
  });

  it("sets Comment nodes height from measured", () => {
    const reactFlowNode = createMockReactFlowNode({
      type: "nodetool.workflows.base_node.Comment",
      measured: { width: 200, height: 100 },
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.height).toBe(100);
  });

  it("sets Group nodes height from measured", () => {
    const reactFlowNode = createMockReactFlowNode({
      type: "nodetool.workflows.base_node.Group",
      measured: { width: 300, height: 200 },
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.height).toBe(200);
  });

  it("sets Preview nodes height from measured", () => {
    const reactFlowNode = createMockReactFlowNode({
      type: "nodetool.workflows.base_node.Preview",
      measured: { width: 400, height: 300 },
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.height).toBe(300);
  });

  it("handles empty string type", () => {
    const reactFlowNode = createMockReactFlowNode({
      type: "",
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.type).toBe("");
  });

  it("handles missing dynamic_properties", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: createMockNodeData({
        dynamic_properties: undefined as any,
      }),
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.dynamic_properties).toEqual({});
  });

  it("handles missing dynamic_outputs", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: createMockNodeData({
        dynamic_outputs: undefined as any,
      }),
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.dynamic_outputs).toEqual({});
  });

  it("preserves bypassed state in ui_properties", () => {
    const reactFlowNode = createMockReactFlowNode({
      data: createMockNodeData({
        bypassed: true,
      }),
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(getUiProperties(result)?.bypassed).toBe(true);
  });
});
