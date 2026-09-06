import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { GROUP_NODE_TYPE } from "../../constants/nodeTypes";

/** Group nodes cannot themselves be put inside a group. */
const useIsGroupable = () => {
  const isGroup = useCallback(
    (node: Node<NodeData>) => node.type === GROUP_NODE_TYPE,
    []
  );

  const isGroupable = useCallback(
    (node: Node<NodeData>) => !isGroup(node),
    [isGroup]
  );

  return { isGroupable, isGroup };
};

export { useIsGroupable };
