import type { Node, NodeProps } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";
import isEqual from "../../utils/isEqual";

/**
 * Memo comparator for BaseNode. Lists every prop the node reads: a prop left
 * out here stops reaching the node when it is the only one that changed.
 */
export const baseNodePropsEqual = (
  prevProps: NodeProps<Node<NodeData>>,
  nextProps: NodeProps<Node<NodeData>>
): boolean =>
  prevProps.id === nextProps.id &&
  prevProps.type === nextProps.type &&
  prevProps.selected === nextProps.selected &&
  prevProps.dragging === nextProps.dragging &&
  prevProps.parentId === nextProps.parentId &&
  prevProps.height === nextProps.height &&
  isEqual(prevProps.data, nextProps.data);
