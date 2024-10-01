import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useNodeStore } from "../stores/NodeStore";
import { useReactFlow } from "@xyflow/react";
import { useCreateLoopNode } from "./createnodes/useCreateLoopNode";

export const useCreateNode = (
  centerPosition: { x: number; y: number } | undefined = undefined
) => {
  const menuPosition = useNodeMenuStore((state) => state.menuPosition);
  const reactFlowInstance = useReactFlow();
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);

  const LOOP_NODE_TYPE = "nodetool.group.Loop";

  const createLoopNode = useCreateLoopNode();

  const handleCreateNode = useCallback(
    (metadata: NodeMetadata) => {
      if (!reactFlowInstance) return;

      const position = centerPosition
        ? {
            x: centerPosition.x,
            y: centerPosition.y
          }
        : {
            x: menuPosition.x,
            y: menuPosition.y
          };

      console.log(position);

      if (metadata.node_type === LOOP_NODE_TYPE) {
        createLoopNode(metadata, position);
      } else {
        const rfPos = reactFlowInstance.screenToFlowPosition(position);
        const newNode = createNode(metadata, rfPos);
        addNode(newNode);
      }
    },
    [
      reactFlowInstance,
      centerPosition,
      menuPosition.x,
      menuPosition.y,
      createLoopNode,
      createNode,
      addNode
    ]
  );

  return handleCreateNode;
};
