import { reactFlowNodeToGraphNode } from "./reactFlowNodeToGraphNode";
import type { Node } from "@xyflow/react";
import type { NodeData } from "./NodeData";

function makeNode(overrides: Partial<Node<NodeData>> = {}): Node<NodeData> {
  return {
    id: "node-1",
    type: "nodetool.text.TextNode",
    position: { x: 100, y: 200 },
    data: {
      properties: { text: "hello" },
      selectable: true,
      dynamic_properties: {},
      workflow_id: "wf-1",
    },
    ...overrides,
  };
}

describe("reactFlowNodeToGraphNode", () => {
  it("converts a basic node with default values", () => {
    const result = reactFlowNodeToGraphNode(makeNode());

    expect(result.id).toBe("node-1");
    expect(result.type).toBe("nodetool.text.TextNode");
    expect(result.data).toEqual({ text: "hello" });
    expect(result.ui_properties.position).toEqual({ x: 100, y: 200 });
    expect(result.ui_properties.zIndex).toBe(0);
    expect(result.ui_properties.width).toBe(280);
    expect(result.ui_properties.height).toBeUndefined();
    expect(result.ui_properties.selectable).toBe(true);
    expect(result.sync_mode).toBe("on_any");
  });

  it("preserves title and color from node data", () => {
    const result = reactFlowNodeToGraphNode(
      makeNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          workflow_id: "wf-1",
          title: "My Node",
          color: "#ff0000",
        },
      })
    );

    expect(result.ui_properties.title).toBe("My Node");
    expect(result.ui_properties.color).toBe("#ff0000");
  });

  it("picks up explicit user resize width from node.width", () => {
    const result = reactFlowNodeToGraphNode(makeNode({ width: 400 }));

    expect(result.ui_properties.width).toBe(400);
  });

  it("picks up width from node.style when node.width is absent", () => {
    const result = reactFlowNodeToGraphNode(
      makeNode({ style: { width: 350 } })
    );

    expect(result.ui_properties.width).toBe(350);
  });

  it("picks up explicit user resize height from node.height", () => {
    const result = reactFlowNodeToGraphNode(makeNode({ height: 500 }));

    expect(result.ui_properties.height).toBe(500);
  });

  it("picks up height from node.style when node.height is absent", () => {
    const result = reactFlowNodeToGraphNode(
      makeNode({ style: { height: 300 } })
    );

    expect(result.ui_properties.height).toBe(300);
  });

  it("sets selectable to false for Loop nodes", () => {
    const result = reactFlowNodeToGraphNode(
      makeNode({ type: "nodetool.group.Loop" })
    );

    expect(result.ui_properties.selectable).toBe(false);
  });

  it("falls back to measured height for Loop nodes", () => {
    const result = reactFlowNodeToGraphNode(
      makeNode({
        type: "nodetool.group.Loop",
        measured: { width: 280, height: 600 },
      })
    );

    expect(result.ui_properties.height).toBe(600);
  });

  it("falls back to measured height for Comment nodes", () => {
    const result = reactFlowNodeToGraphNode(
      makeNode({
        type: "nodetool.workflows.base_node.Comment",
        measured: { width: 280, height: 150 },
      })
    );

    expect(result.ui_properties.height).toBe(150);
  });

  it("falls back to measured height for Group nodes", () => {
    const result = reactFlowNodeToGraphNode(
      makeNode({
        type: "nodetool.workflows.base_node.Group",
        measured: { width: 280, height: 400 },
      })
    );

    expect(result.ui_properties.height).toBe(400);
  });

  it("falls back to measured height for Preview nodes", () => {
    const result = reactFlowNodeToGraphNode(
      makeNode({
        type: "nodetool.workflows.base_node.Preview",
        measured: { width: 280, height: 250 },
      })
    );

    expect(result.ui_properties.height).toBe(250);
  });

  it("preserves parentId", () => {
    const result = reactFlowNodeToGraphNode(
      makeNode({ parentId: "group-1" })
    );

    expect(result.parent_id).toBe("group-1");
  });

  it("preserves bypassed flag", () => {
    const result = reactFlowNodeToGraphNode(
      makeNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          workflow_id: "wf-1",
          bypassed: true,
        },
      })
    );

    expect(result.ui_properties.bypassed).toBe(true);
  });

  it("preserves dynamic_properties and dynamic_outputs", () => {
    const result = reactFlowNodeToGraphNode(
      makeNode({
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: { foo: "bar" },
          dynamic_outputs: { out: { type: "string", optional: false, type_args: [] } },
          workflow_id: "wf-1",
        },
      })
    );

    expect(result.dynamic_properties).toEqual({ foo: "bar" });
    expect(result.dynamic_outputs).toEqual({ out: { type: "string", optional: false, type_args: [] } });
  });

  it("defaults type to empty string when node.type is undefined", () => {
    const result = reactFlowNodeToGraphNode(makeNode({ type: undefined }));

    expect(result.type).toBe("");
  });
});
