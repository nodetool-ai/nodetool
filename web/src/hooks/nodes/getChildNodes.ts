import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

export type NodesByParent = Record<string, Node<NodeData>[]>;

export const getChildNodes = (
  allNodes: Node<NodeData>[],
  parentNodeId: string
): Node<NodeData>[] => {
  const children = allNodes.filter((node) => node.parentId === parentNodeId);
  return children;
};
