import { useCallback } from "react";
import { useNodeStore } from "../stores/NodeStore";
import { v4 as uuidv4 } from "uuid";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { DUPLICATE_SPACING_X } from "../config/constants";

export const useDuplicateNodes = () => {
  const nodes = useNodeStore((state) => state.nodes);
  const setNodes = useNodeStore((state) => state.setNodes);
  const getSelectedNodes = useNodeStore((state) => state.getSelectedNodes);

  return useCallback(() => {
    const selectedNodes = getSelectedNodes();

    let boundsLeft = Infinity;
    for (const node of selectedNodes) {
      boundsLeft = Math.min(boundsLeft, node.position.x);
    }

    let boundsRight = -Infinity;
    for (const node of nodes) {
      boundsRight = Math.max(
        boundsRight,
        node.position.x + (node.measured?.width || 0)
      );
    }

    const offset = boundsRight + DUPLICATE_SPACING_X - boundsLeft;

    const newNodes = selectedNodes.map((node: Node<NodeData>) => ({
      ...node,
      id: uuidv4(),
      position: {
        x: node.position.x + offset,
        y: node.position.y
      },
      selected: true
    }));

    const updatedNodes = nodes.map((node) => ({ ...node, selected: false }));

    setNodes([...updatedNodes, ...newNodes]);
  }, [nodes, setNodes, getSelectedNodes]);
};
