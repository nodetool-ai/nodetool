/**
 * This hook returns a callback function that checks if a given node
 * can be included in a group or region. Certain node types (Loop, Comment, Group, and Region nodes)
 * are not groupable as they themselves are containers.
 *
 * @returns {Function} A callback function that takes a Node<NodeData> and returns a boolean.
 */

import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { isRegionNodeType } from "../../utils/nodeUtils";

const useIsGroupable = () => {
  const isGroupable = useCallback((node: Node<NodeData>) => {
    return !(
      node.type === "nodetool.group.Loop" ||
      // node.type === "nodetool.workflows.base_node.Comment" ||
      node.type === "nodetool.workflows.base_node.Group" ||
      isRegionNodeType(node.type || "")
    );
  }, []);

  const isGroup = useCallback((node: Node<NodeData>) => {
    return (
      node.type === "nodetool.group.Loop" ||
      // node.type === "nodetool.workflows.base_node.Comment" ||
      node.type === "nodetool.workflows.base_node.Group" ||
      isRegionNodeType(node.type || "")
    );
  }, []);

  return { isGroupable, isGroup };
};

export { useIsGroupable };
