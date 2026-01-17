// Mock NodeStore to avoid complex dependency chain
jest.mock("../NodeStore", () => ({
  DEFAULT_NODE_WIDTH: 200,
}));

import { reactFlowNodeToGraphNode } from "../reactFlowNodeToGraphNode";
import { NodeData } from "../NodeData";
import { Node } from "@xyflow/react";
import { DEFAULT_NODE_WIDTH } from "../NodeStore";

describe("reactFlowNodeToGraphNode", () => {
  const createMockReactFlowNode = (overrides: Partial<Node<NodeData>> = {}): Node<NodeData> => ({
    id: "node-1",
    type: "nodetool.input.StringInput",
    position: { x: 100, y: 200 },
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      dynamic_outputs: {},
      sync_mode: "on_any",
      workflow_id: "workflow-1",
    },
    width: 200,
    height: 100,
    selected: false,
    dragHandle: ".node-drag-handle",
    ...overrides,
  });

  describe("basic conversion", () => {
    it("converts a basic node with required fields", () => {
      const node = createMockReactFlowNode();

      const result = reactFlowNodeToGraphNode(node);

      expect(result.id).toBe("node-1");
      expect(result.type).toBe("nodetool.input.StringInput");
      expect(result.parent_id).toBeUndefined();
      expect(result.ui_properties).toBeDefined();
    });

    it("uses empty string for undefined type", () => {
      const node = createMockReactFlowNode({ type: undefined as any });

      const result = reactFlowNodeToGraphNode(node);

      expect(result.type).toBe("");
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

    it("maps undefined properties to undefined", () => {
      const node = createMockReactFlowNode({
        data: {
          properties: undefined,
          selectable: true,
          dynamic_properties: {},
          dynamic_outputs: {},
          sync_mode: "on_any",
          workflow_id: "workflow-1",
        },
      });

      const result = reactFlowNodeToGraphNode(node);

      // When properties is undefined, result.data is undefined
      expect(result.data).toBeUndefined();
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
    it("sets selected state", () => {
      const node = createMockReactFlowNode({ selected: true });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.selected).toBe(true);
    });

    it("sets position from node", () => {
      const node = createMockReactFlowNode({ position: { x: 150, y: 250 } });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.position).toEqual({ x: 150, y: 250 });
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

    it("sets selectable to true by default", () => {
      const node = createMockReactFlowNode();

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.selectable).toBe(true);
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
  });

  describe("explicit height from style", () => {
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
    it("sets selectable to false for Loop nodes", () => {
      const node = createMockReactFlowNode({ type: "nodetool.group.Loop" });

      const result = reactFlowNodeToGraphNode(node);

      expect((result.ui_properties as any)?.selectable).toBe(false);
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
