import { useCallback } from "react";
import { useNodes } from "../contexts/NodeContext";
import { NodeColorValue } from "../config/nodeColors";

interface NodeColorActionsReturn {
  setNodeColor: (nodeId: string, color: NodeColorValue) => void;
  setSelectedNodesColor: (color: NodeColorValue) => void;
}

export const useNodeColorActions = (): NodeColorActionsReturn => {
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const setSelectedNodesColor = useNodes(
    (state) => state.setSelectedNodesColor
  );

  const setNodeColor = useCallback(
    (nodeId: string, color: NodeColorValue) => {
      updateNodeData(nodeId, { color });
    },
    [updateNodeData]
  );

  return {
    setNodeColor,
    setSelectedNodesColor
  };
};

export default useNodeColorActions;
