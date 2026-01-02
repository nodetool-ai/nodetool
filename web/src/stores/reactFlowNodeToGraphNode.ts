import { Node } from "@xyflow/react";
import { Node as GraphNode } from "./ApiTypes";
import { NodeData } from "./NodeData";
import { NodeUIProperties, DEFAULT_NODE_WIDTH } from "./NodeStore";
import { isContainerNodeType } from "../utils/nodeUtils";

export function reactFlowNodeToGraphNode(node: Node<NodeData>): GraphNode {
  const nodeType = node.type || "";
  const isContainer = isContainerNodeType(nodeType);
  
  const ui_properties: NodeUIProperties = {
    selected: node.selected,
    position: node.position,
    zIndex: node.zIndex || 0,
    width: node.measured?.width || DEFAULT_NODE_WIDTH,
    height: undefined,
    title: node.data.title,
    color: node.data.color,
    selectable: true
  };

  // Container nodes (groups, loops, regions) need height stored and should not be selectable by default
  if (isContainer) {
    ui_properties.selectable = false;
    ui_properties.height = node.measured?.height;
  }

  // Other node types that need height stored
  if (
    nodeType === "nodetool.workflows.base_node.Comment" ||
    nodeType === "nodetool.workflows.base_node.Preview"
  ) {
    ui_properties.height = node.measured?.height;
  }

  return {
    id: node.id,
    type: nodeType,
    data: node.data?.properties,
    parent_id: node.parentId,
    ui_properties: ui_properties,
    dynamic_properties: node.data?.dynamic_properties || {},
    dynamic_outputs: node.data?.dynamic_outputs || {},
    sync_mode: node.data?.sync_mode || "on_any"
  };
}
