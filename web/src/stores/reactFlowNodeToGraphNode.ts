import { Node } from "@xyflow/react";
import { Node as GraphNode } from "./ApiTypes";
import { NodeData } from "./NodeData";
import { NodeUIProperties, DEFAULT_NODE_WIDTH } from "./NodeStore";
import { SUBGRAPH_NODE_TYPE } from "../types/subgraph";

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
    bypassed: node.data.bypassed || false
  };

  // Persist explicit vertical resize (NodeResizeControl writes to node.style.height)
  if (
    node.style &&
    "height" in node.style &&
    typeof (node.style as any).height === "number"
  ) {
    ui_properties.height = (node.style as any).height;
  }

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

  // For subgraph nodes, ensure subgraphId is preserved in properties
  const isSubgraphNode = node.type === SUBGRAPH_NODE_TYPE;
  const properties = node.data?.properties || {};
  
  if (isSubgraphNode && node.data.subgraphId) {
    properties.subgraphId = node.data.subgraphId;
  }

  return {
    id: node.id,
    type: node.type || "",
    data: properties,
    parent_id: node.parentId,
    ui_properties: ui_properties,
    dynamic_properties: node.data?.dynamic_properties || {},
    dynamic_outputs: node.data?.dynamic_outputs || {},
    sync_mode: node.data?.sync_mode || "on_any"
  };
}
