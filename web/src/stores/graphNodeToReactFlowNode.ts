import { Node } from "@xyflow/react";
import { Workflow, Node as GraphNode } from "./ApiTypes";
import { NodeData } from "./NodeData";
import { parseNodeUIProperties, DEFAULT_NODE_WIDTH } from "./nodeUiDefaults";
import useMetadataStore from "./MetadataStore";
import { applyDefaultModels } from "../utils/applyDefaultModels";
import { reactFlowNodeChromeClassName } from "../utils/reactFlowNodeChromeClassName";
import { NODE_COLLAPSED_STRIP_HEIGHT_PX } from "./collapseNodeLayout";
import {
  GROUP_NODE_TYPE,
  COMMENT_NODE_TYPE,
  PREVIEW_NODE_TYPE
} from "../constants/nodeTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function graphNodeToReactFlowNode(
  workflow: Workflow,
  node: GraphNode
): Node<NodeData> {
  const ui_properties = parseNodeUIProperties(node.ui_properties);
  const isCollapsed = ui_properties?.collapsed === true;
  const isPreviewNode = node.type === PREVIEW_NODE_TYPE;
  const isCompareImagesNode = node.type === "nodetool.compare.CompareImages";

  // Debug: warn if node.data contains a stale workflow_id
  if (
    isRecord(node.data) &&
    "workflow_id" in node.data
  ) {
    console.warn(
      `[graphNodeToReactFlowNode] Node ${node.id} has stale workflow_id in data:`,
      node.data.workflow_id,
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

  const strip = NODE_COLLAPSED_STRIP_HEIGHT_PX;
  const expandedHeightPxForData =
    isCollapsed &&
    typeof defaultHeight === "number" &&
    defaultHeight > strip
      ? defaultHeight
      : undefined;
  const reactFlowHeight = isCollapsed ? strip : defaultHeight;
  const reactFlowStyleHeight = isCollapsed ? strip : defaultHeight;

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
      node.type === COMMENT_NODE_TYPE ||
      node.type === GROUP_NODE_TYPE
    ),
    selectable,
    className: reactFlowNodeChromeClassName({
      bypassed: isBypassed,
      collapsed: isCollapsed
    }),
    data: {
      properties: (() => {
        const raw = node.data;
        const props: Record<string, unknown> = isRecord(raw) ? raw : {};
        const meta = useMetadataStore.getState().getMetadata(node.type);
        if (meta?.properties) {
          return applyDefaultModels(props, meta.properties);
        }
        return props;
      })(),
      dynamic_properties: node.dynamic_properties ?? {},
      dynamic_outputs: node.dynamic_outputs || {},
      selectable,
      collapsed: isCollapsed,
      bypassed: isBypassed,
      workflow_id: workflow.id,
      title: ui_properties?.title,
      color: ui_properties?.color,
      originalType: node.type,
      model_id: ui_properties?.model_id,
      endpoint_id: ui_properties?.endpoint_id,
      selected_generation: ui_properties?.selected_generation,
      ...(expandedHeightPxForData != null
        ? { expandedHeightPx: expandedHeightPxForData }
        : {})
    },
    position: ui_properties?.position || { x: 0, y: 0 },
    // Set both top-level width/height (used by ReactFlow after resize) and style (for initial render)
    // ReactFlow's applyNodeChanges sets node.width/height when user resizes, so we restore them here
    width: defaultWidth,
    height: reactFlowHeight,
    style: {
      width: defaultWidth,
      height: reactFlowStyleHeight
    },
    zIndex:
      node.type === "nodetool.group.Loop" ||
      node.type === GROUP_NODE_TYPE
        ? -10
        : ui_properties?.zIndex
  };
}
