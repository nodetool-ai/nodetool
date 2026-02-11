jest.mock("../../components/node_types/PlaceholderNode", () => () => null);
jest.mock("../NodeStore", () => ({
  DEFAULT_NODE_WIDTH: 200,
}));

import { reactFlowNodeToGraphNode } from "../reactFlowNodeToGraphNode";
import { Node } from "@xyflow/react";
import { NodeData } from "../NodeData";
import { Node as GraphNode } from "../ApiTypes";
import { NodeUIProperties, DEFAULT_NODE_WIDTH } from "../nodeUiDefaults";

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

  it("converts a basic node with required fields", () => {
    const node = createMockReactFlowNode();

    const result = reactFlowNodeToGraphNode(node);

    expect(result.id).toBe("node-1");
    expect(result.type).toBe("nodetool.text.Prompt");
    expect(result.parent_id).toBeUndefined();
    expect(result.ui_properties).toBeDefined();
  });

  it("handles empty string type", () => {
    const reactFlowNode = createMockReactFlowNode({
      type: "",
    });

    const result = reactFlowNodeToGraphNode(reactFlowNode);

    expect(result.type).toBe("");
  });

  it("uses empty string for undefined type", () => {
    const node = createMockReactFlowNode({ type: undefined as any });

    const result = reactFlowNodeToGraphNode(node);

    expect(result.type).toBe("");
  });

  describe("parent_id handling", () => {
    it("preserves parent_id from parentId", () => {
      const reactFlowNode = createMockReactFlowNode({
        parentId: "parent-node",
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(result.parent_id).toBe("parent-node");
    });

    it("maps parentId to parent_id", () => {
      const node = createMockReactFlowNode({ parentId: "parent-node" });

      const result = reactFlowNodeToGraphNode(node);

      expect(result.parent_id).toBe("parent-node");
    });

    it("sets parent_id to undefined when parentId is undefined", () => {
      const node = createMockReactFlowNode();

      const result = reactFlowNodeToGraphNode(node);

      expect(result.parent_id).toBeUndefined();
    });
  });

  describe("data conversion", () => {
    it("copies properties from node data", () => {
      const reactFlowNode = createMockReactFlowNode({
        data: createMockNodeData({
          properties: { text: "Test", count: 42 },
        }),
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(result.data).toEqual({ text: "Test", count: 42 });
    });

    it("maps properties from data to result", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: { testProp: "testValue" },
          selectable: true,
          dynamic_properties: {},
          dynamic_outputs: {},
          sync_mode: "on_any",
          workflow_id: "workflow-1",
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect(result.data).toEqual({ testProp: "testValue" });
    });

    it("maps empty properties to empty object", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          dynamic_outputs: {},
          sync_mode: "on_any",
          workflow_id: "workflow-1",
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect(result.data).toEqual({});
    });

    it("maps undefined properties to empty object", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: {} as Record<string, unknown>,
          selectable: true,
          dynamic_properties: {},
          dynamic_outputs: {},
          sync_mode: "on_any",
          workflow_id: "workflow-1",
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect(result.data).toEqual({});
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

    it("maps dynamic_properties to result", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: { dynamicProp: "value" },
          dynamic_outputs: {},
          sync_mode: "on_any",
          workflow_id: "workflow-1",
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect(result.dynamic_properties).toEqual({ dynamicProp: "value" });
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

    it("copies dynamic_outputs from node data", () => {
      const reactFlowNode = createMockReactFlowNode({
        data: createMockNodeData({
          dynamic_outputs: { output: { type: "text", optional: false, type_args: [] } as any },
        }),
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(result.dynamic_outputs).toHaveProperty("output");
    });

    it("maps dynamic_outputs to result", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          dynamic_outputs: { output1: { type: "text" } } as any,
          sync_mode: "on_any",
          workflow_id: "workflow-1",
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect(result.dynamic_outputs).toEqual({ output1: { type: "text" } });
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

    it("defaults sync_mode to 'on_any' when not provided", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          dynamic_outputs: {},
          sync_mode: undefined,
          workflow_id: "workflow-1",
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect(result.sync_mode).toBe("on_any");
    });

    it("maps sync_mode when provided", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          dynamic_outputs: {},
          sync_mode: "on_change",
          workflow_id: "workflow-1",
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect(result.sync_mode).toBe("on_change");
    });
  });

  describe("ui_properties construction", () => {
    it("creates ui_properties with selected state", () => {
      const reactFlowNode = createMockReactFlowNode({
        selected: true,
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect((result as unknown as { ui_properties: NodeUIProperties }).ui_properties?.selected).toBe(true);
    });

    it("sets selected state", () => {
      const node = createMockReactFlowNode({ selected: true });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.selected).toBe(true);
    });

    it("creates ui_properties with position", () => {
      const reactFlowNode = createMockReactFlowNode({
        position: { x: 150, y: 250 },
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(getUiProperties(result)?.position).toEqual({ x: 150, y: 250 });
    });

    it("sets position from node", () => {
      const node = createMockReactFlowNode({ position: { x: 150, y: 250 } });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.position).toEqual({ x: 150, y: 250 });
    });

    it("creates ui_properties with zIndex", () => {
      const reactFlowNode = createMockReactFlowNode({
        zIndex: 50,
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(getUiProperties(result)?.zIndex).toBe(50);
    });

    it("sets zIndex from node", () => {
      const node = createMockReactFlowNode({ zIndex: 5 });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.zIndex).toBe(5);
    });

    it("defaults zIndex to 0 when not provided", () => {
      const node = createMockReactFlowNode({ zIndex: undefined });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.zIndex).toBe(0);
    });

    it("uses measured width for ui_properties", () => {
      const reactFlowNode = createMockReactFlowNode({
        measured: { width: 300, height: 200 },
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(getUiProperties(result)?.width).toBe(300);
    });

    it("uses measured width when available", () => {
      const node = createMockReactFlowNode({ measured: { width: 250, height: 150 } });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.width).toBe(250);
    });

    it("uses DEFAULT_NODE_WIDTH when measured width is not available", () => {
      const node = createMockReactFlowNode({ measured: undefined });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.width).toBe(DEFAULT_NODE_WIDTH);
    });

    it("sets height from measured height for specific node types", () => {
      const node = createMockReactFlowNode({
        type: "nodetool.workflows.base_node.Comment",
        measured: { width: 200, height: 100 },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.height).toBe(100);
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

    it("maps title from data", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          dynamic_outputs: {},
          sync_mode: "on_any",
          workflow_id: "workflow-1",
          title: "My Node",
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.title).toBe("My Node");
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

    it("maps color from data", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          dynamic_outputs: {},
          sync_mode: "on_any",
          workflow_id: "workflow-1",
          color: "#ff0000",
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.color).toBe("#ff0000");
    });

    it("creates ui_properties with selectable true by default", () => {
      const reactFlowNode = createMockReactFlowNode();

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(getUiProperties(result)?.selectable).toBe(true);
    });

    it("sets selectable to true by default", () => {
      const node = createMockReactFlowNode();

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.selectable).toBe(true);
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

    it("sets bypassed from data", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          dynamic_outputs: {},
          sync_mode: "on_any",
          workflow_id: "workflow-1",
          bypassed: true,
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.bypassed).toBe(true);
    });

    it("defaults bypassed to false when not provided", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          dynamic_outputs: {},
          sync_mode: "on_any",
          workflow_id: "workflow-1",
          bypassed: undefined,
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.bypassed).toBe(false);
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

  describe("explicit height from style", () => {
    it("applies explicit height from node.style for vertical resize", () => {
      const reactFlowNode = createMockReactFlowNode({
        style: { width: 200, height: 150 } as any,
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(getUiProperties(result)?.height).toBe(150);
    });

    it("uses height from node.style when it's a number", () => {
      const node = createMockReactFlowNode({
        style: { width: 200, height: 150 } as any,
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.height).toBe(150);
    });

    it("uses measured height when style height is not a number", () => {
      const node = createMockReactFlowNode({
        style: { width: 200, height: "150px" } as any,
        measured: { width: 200, height: 100 },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.height).toBeUndefined();
    });

    it("does not override height when style height is not present", () => {
      const node = createMockReactFlowNode({
        style: { width: 200 } as any,
        measured: { width: 200, height: 100 },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.height).toBeUndefined();
    });
  });

  describe("Loop node special handling", () => {
    it("sets Loop nodes as not selectable", () => {
      const reactFlowNode = createMockReactFlowNode({
        type: "nodetool.group.Loop",
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(getUiProperties(result)?.selectable).toBe(false);
    });

    it("sets selectable to false for Loop nodes", () => {
      const node = createMockReactFlowNode({ type: "nodetool.group.Loop" });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.selectable).toBe(false);
    });

    it("sets Loop nodes height from measured", () => {
      const reactFlowNode = createMockReactFlowNode({
        type: "nodetool.group.Loop",
        measured: { width: 200, height: 150 },
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(getUiProperties(result)?.height).toBe(150);
    });

    it("uses measured height for Loop nodes", () => {
      const node = createMockReactFlowNode({
        type: "nodetool.group.Loop",
        measured: { width: 300, height: 200 },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.height).toBe(200);
    });
  });

  describe("Comment node special handling", () => {
    it("sets Comment nodes height from measured", () => {
      const reactFlowNode = createMockReactFlowNode({
        type: "nodetool.workflows.base_node.Comment",
        measured: { width: 200, height: 100 },
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(getUiProperties(result)?.height).toBe(100);
    });

    it("uses measured height for Comment nodes", () => {
      const node = createMockReactFlowNode({
        type: "nodetool.workflows.base_node.Comment",
        measured: { width: 300, height: 150 },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.height).toBe(150);
    });
  });

  describe("Group node special handling", () => {
    it("sets Group nodes height from measured", () => {
      const reactFlowNode = createMockReactFlowNode({
        type: "nodetool.workflows.base_node.Group",
        measured: { width: 300, height: 200 },
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(getUiProperties(result)?.height).toBe(200);
    });

    it("uses measured height for Group nodes", () => {
      const node = createMockReactFlowNode({
        type: "nodetool.workflows.base_node.Group",
        measured: { width: 400, height: 300 },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.height).toBe(300);
    });
  });

  describe("Preview node special handling", () => {
    it("sets Preview nodes height from measured", () => {
      const reactFlowNode = createMockReactFlowNode({
        type: "nodetool.workflows.base_node.Preview",
        measured: { width: 400, height: 300 },
      });

      const result = reactFlowNodeToGraphNode(reactFlowNode);

      expect(getUiProperties(result)?.height).toBe(300);
    });

    it("uses measured height for Preview nodes", () => {
      const node = createMockReactFlowNode({
        type: "nodetool.workflows.base_node.Preview",
        measured: { width: 400, height: 300 },
      });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.height).toBe(300);
    });
  });
});
