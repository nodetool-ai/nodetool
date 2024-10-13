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
    let minX = Infinity;
    let maxX = -Infinity;

    const selectedNodes = JSON.parse(JSON.stringify(getSelectedNodes()));

    for (const node of selectedNodes) {
      minX = Math.min(minX, node.position.x);
      maxX = Math.max(
        maxX,
        node.position.x + (node.measured?.width || 0) + DUPLICATE_SPACING_X
      );
    }

    // selection bounds
    const boundsWidth = maxX - minX;

    const newNodes = selectedNodes.map((node: Node<NodeData>) => ({
      ...node,
      id: uuidv4(),
      position: {
        x: node.position.x + boundsWidth,
        y: node.position.y
      },
      selected: true
    }));

    for (const node of nodes) {
      node.selected = false;
    }

    setNodes([...nodes, ...newNodes]);
  }, [nodes, setNodes, getSelectedNodes]);
};
