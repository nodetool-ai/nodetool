import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useNodeStore } from "../stores/NodeStore";
import { useReactFlow } from "reactflow";

export const useCreateNode = () => {
  const { menuPosition } = useNodeMenuStore();
  const reactFlowInstance = useReactFlow();
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);

  const handleCreateNode = useCallback(
    (metadata: NodeMetadata) => {
      if (!menuPosition || !reactFlowInstance) return;
      const newNode = createNode(
        metadata,
        reactFlowInstance.project({
          x: menuPosition.x,
          y: menuPosition.y
        })
      );
      addNode(newNode);
    },
    [menuPosition, addNode, createNode, reactFlowInstance]
  );

  return handleCreateNode;
};
