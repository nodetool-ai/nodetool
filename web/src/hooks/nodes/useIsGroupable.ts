/**
 * This hook returns a callback function that checks if a given node
 * can be included in a group. Certain node types (Loop, Comment, and Group)
 * are not groupable.
 *
 * @returns {Function} A callback function that takes a Node<NodeData> and returns a boolean.
 */

import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

const useIsGroupable = () => {
  const isGroupable = useCallback((node: Node<NodeData>) => {
    return !(
      node.type === "nodetool.group.Loop" ||
      // node.type === "nodetool.workflows.base_node.Comment" ||
      node.type === "nodetool.workflows.base_node.Group"
    );
  }, []);

  const isGroup = useCallback((node: Node<NodeData>) => {
    return (
      node.type === "nodetool.group.Loop" ||
      // node.type === "nodetool.workflows.base_node.Comment" ||
      node.type === "nodetool.workflows.base_node.Group"
    );
  }, []);

  return { isGroupable, isGroup };
};

export { useIsGroupable };
