/** Hook to check if nodes can be included in a group (excludes Loop and Group types). */

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
