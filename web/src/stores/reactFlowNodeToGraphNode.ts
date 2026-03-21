import { Node } from "@xyflow/react";
import { Node as GraphNode } from "./ApiTypes";
import { NodeData } from "./NodeData";
import { NodeUIProperties, DEFAULT_NODE_WIDTH } from "./nodeUiDefaults";
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

  // Persist explicit user resize dimensions
  // ReactFlow's applyNodeChanges sets node.width/height (top-level) when user resizes via NodeResizeControl
  // Also check node.style.width/height for initial load values from graphNodeToReactFlowNode
  if (typeof node.width === "number") {
    ui_properties.width = node.width;
  } else if (
    node.style &&
    "width" in node.style &&
    typeof node.style.width === "number"
  ) {
    ui_properties.width = node.style.width;
  }

  if (typeof node.height === "number") {
    ui_properties.height = node.height;
  } else if (
    node.style &&
    "height" in node.style &&
    typeof node.style.height === "number"
  ) {
    ui_properties.height = node.style.height;
  }

  if (node.type === "nodetool.group.Loop") {
    ui_properties.selectable = false;
    if (ui_properties.height === undefined) {
      ui_properties.height = node.measured?.height;
    }
  }

  if (
    node.type === "nodetool.workflows.base_node.Comment" ||
    node.type === "nodetool.workflows.base_node.Group" ||
    node.type === "nodetool.workflows.base_node.Preview"
  ) {
    if (ui_properties.height === undefined) {
      ui_properties.height = node.measured?.height;
    }
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
