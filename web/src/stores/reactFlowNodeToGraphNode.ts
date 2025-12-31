import { Node } from "@xyflow/react";
import { Node as GraphNode } from "./ApiTypes";
import { NodeData } from "./NodeData";
import { NodeUIProperties, DEFAULT_NODE_WIDTH } from "./NodeStore";

export function reactFlowNodeToGraphNode(node: Node<NodeData>): GraphNode {
  const ui_properties: NodeUIProperties = {
    selected: node.selected,
    position: node.position,
    zIndex: node.zIndex || 0,
    width: node.measured?.width || DEFAULT_NODE_WIDTH,
    height: undefined,
    title: node.data.title,
    color: node.data.color,
    selectable: true,
    bypassed: node.data.bypassed
  };

  if (node.type === "nodetool.group.Loop") {
    ui_properties.selectable = false;
    ui_properties.height = node.measured?.height;
  }

  if (
    node.type === "nodetool.workflows.base_node.Comment" ||
    node.type === "nodetool.workflows.base_node.Group" ||
    node.type === "nodetool.workflows.base_node.Preview"
  ) {
    ui_properties.height = node.measured?.height;
  }

  return {
    id: node.id,
    type: node.type || "",
    data: node.data?.properties,
    parent_id: node.parentId,
    ui_properties: ui_properties,
    dynamic_properties: node.data?.dynamic_properties || {},
    dynamic_outputs: node.data?.dynamic_outputs || {},
    sync_mode: node.data?.sync_mode || "on_any"
  };
}
