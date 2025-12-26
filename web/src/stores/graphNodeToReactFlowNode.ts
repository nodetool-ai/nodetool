import { Node } from "@xyflow/react";
import { Workflow, Node as GraphNode } from "./ApiTypes";
import { NodeData } from "./NodeData";
import { NodeUIProperties, DEFAULT_NODE_WIDTH } from "./NodeStore";

export function graphNodeToReactFlowNode(
  workflow: Workflow,
  node: GraphNode
): Node<NodeData> {
  const ui_properties = node.ui_properties as NodeUIProperties;
  const isPreviewNode = node.type === "nodetool.workflows.base_node.Preview";
  
  // Debug: warn if node.data contains a stale workflow_id
  if (node.data && typeof node.data === 'object' && 'workflow_id' in node.data) {
    console.warn(`[graphNodeToReactFlowNode] Node ${node.id} has stale workflow_id in data:`, (node.data as any).workflow_id, 'will use:', workflow.id);
  }
  
  // Set default size for Preview nodes if not already set
  const defaultWidth = isPreviewNode && !ui_properties?.width ? 400 : (ui_properties?.width || DEFAULT_NODE_WIDTH);
  const defaultHeight = isPreviewNode && !ui_properties?.height ? 300 : ui_properties?.height;
  
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
      dynamic_outputs: node.dynamic_outputs || {},
      sync_mode: node.sync_mode,
      selectable: ui_properties?.selectable,
      collapsed: false,
      workflow_id: workflow.id,
      title: ui_properties?.title,
      color: ui_properties?.color,
      originalType: node.type
    },
    position: ui_properties?.position || { x: 0, y: 0 },
    style: {
      width: defaultWidth,
      height: defaultHeight
    },
    zIndex:
      node.type === "nodetool.group.Loop" ||
      node.type === "nodetool.workflows.base_node.Group"
        ? -10
        : ui_properties?.zIndex
  };
}
