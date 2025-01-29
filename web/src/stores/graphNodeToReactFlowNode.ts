import { Node } from "@xyflow/react";
import { Workflow, Node as GraphNode } from "./ApiTypes";
import { NodeData } from "./NodeData";
import { NodeUIProperties, DEFAULT_NODE_WIDTH } from "./NodeStore";

export function graphNodeToReactFlowNode(
  workflow: Workflow,
  node: GraphNode
): Node<NodeData> {
  const ui_properties = node.ui_properties as NodeUIProperties;
  return {
    type: node.type,
    id: node.id,
    parentId: node.parent_id || undefined,
    dragHandle: ".node-drag-handle",
    expandParent: !(
      node.type === "nodetool.group.Loop" ||
      node.type === "nodetool.workflows.base_node.Comment" ||
      node.type === "nodetool.workflows.base_node.Group"
    ),
    selectable: ui_properties?.selectable,
    data: {
      properties: node.data || {},
      dynamic_properties: node.dynamic_properties || {},
      selectable: ui_properties?.selectable,
      dirty: true,
      collapsed: false,
      workflow_id: workflow.id,
      title: ui_properties?.title,
      color: ui_properties?.color
    },
    position: ui_properties?.position || { x: 0, y: 0 },
    style: {
      width: ui_properties?.width || DEFAULT_NODE_WIDTH,
      height: ui_properties?.height
    },
    zIndex:
      node.type == "nodetool.group.Loop" ||
      node.type == "nodetool.workflows.base_node.Group"
        ? -10
        : ui_properties?.zIndex
  };
}
