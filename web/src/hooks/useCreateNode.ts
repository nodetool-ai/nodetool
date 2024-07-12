import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useNodeStore } from "../stores/NodeStore";
import { useReactFlow } from "reactflow";
import { useCreateLoopNode } from "./createnodes/useCreateLoopNode";

export const useCreateNode = () => {
  const { menuPosition } = useNodeMenuStore();
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
        console.log(metadata);
        createLoopNode(metadata, position);
      } else {
        const newNode = createNode(
          metadata,
          reactFlowInstance.screenToFlowPosition(position)
        );
        addNode(newNode);
      }
    },
    [menuPosition, reactFlowInstance, createLoopNode, createNode, addNode]
  );

  return handleCreateNode;
};
