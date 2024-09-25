import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useNodeStore } from "../stores/NodeStore";
import { useReactFlow } from "@xyflow/react";
import { useCreateLoopNode } from "./createnodes/useCreateLoopNode";

export const useCreateNode = () => {
  const menuPosition = useNodeMenuStore((state) => state.menuPosition);
  const reactFlowInstance = useReactFlow();
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);

  const LOOP_NODE_TYPE = "nodetool.group.Loop";

  const createLoopNode = useCreateLoopNode();

  const handleCreateNode = useCallback(
    (metadata: NodeMetadata) => {
      if (!menuPosition || !reactFlowInstance) return;
      const position = {
        x: menuPosition.x,
        y: menuPosition.y
      };

      if (metadata.node_type === LOOP_NODE_TYPE) {
        createLoopNode(metadata, position);
      } else {
        const rfPos = reactFlowInstance.screenToFlowPosition(position);
        const newNode = createNode(metadata, rfPos);
        addNode(newNode);
      }
    },
    [menuPosition, reactFlowInstance, createLoopNode, createNode, addNode]
  );

  return handleCreateNode;
};
