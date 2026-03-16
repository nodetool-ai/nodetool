import { Node } from "@xyflow/react";
import { Workflow, Node as GraphNode } from "./ApiTypes";
import { NodeData } from "./NodeData";
import { NodeUIProperties, DEFAULT_NODE_WIDTH } from "./nodeUiDefaults";

export function graphNodeToReactFlowNode(
  workflow: Workflow,
  node: GraphNode
): Node<NodeData> {
  const ui_properties = node.ui_properties as NodeUIProperties;
  const isPreviewNode = node.type === "nodetool.workflows.base_node.Preview";
  const isCompareImagesNode = node.type === "nodetool.compare.CompareImages";

  // Debug: warn if node.data contains a stale workflow_id
  if (
    node.data &&
    typeof node.data === "object" &&
    "workflow_id" in node.data
  ) {
    console.warn(
      `[graphNodeToReactFlowNode] Node ${node.id} has stale workflow_id in data:`,
      (node.data as any).workflow_id,
      "will use:",
      workflow.id
    );
  }

  // Set default size for Preview and CompareImages nodes if not already set
  let defaultWidth = ui_properties?.width || DEFAULT_NODE_WIDTH;
  let defaultHeight = ui_properties?.height;

  if (isPreviewNode && !ui_properties?.width) {
    defaultWidth = 400;
  }
  if (isPreviewNode && !ui_properties?.height) {
    defaultHeight = 300;
  }
  if (isCompareImagesNode && !ui_properties?.width) {
    defaultWidth = 450;
  }
  if (isCompareImagesNode && !ui_properties?.height) {
    defaultHeight = 350;
  }

  const isBypassed = ui_properties?.bypassed || false;

  // PreviewNodes are selectable via click and selection box, 
  // but should be ignored when dragging (handled in drag handler)
  const selectable = ui_properties?.selectable;

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
    selectable,
    className: isBypassed ? "bypassed" : undefined,
    data: {
      properties: (node.data || {}) as Record<string, unknown>,
      dynamic_properties: (node.dynamic_properties || {}) as Record<string, unknown>,
      dynamic_outputs: node.dynamic_outputs || {},
      sync_mode: node.sync_mode,
      selectable,
      collapsed: false,
      bypassed: isBypassed,
      workflow_id: workflow.id,
      title: ui_properties?.title,
      color: ui_properties?.color,
      originalType: node.type
    },
    position: ui_properties?.position || { x: 0, y: 0 },
    // Set both top-level width/height (used by ReactFlow after resize) and style (for initial render)
    // ReactFlow's applyNodeChanges sets node.width/height when user resizes, so we restore them here
    width: defaultWidth,
    height: defaultHeight,
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
