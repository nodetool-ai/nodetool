import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import { useShallow } from "zustand/react/shallow";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { useRecentNodesStore } from "../stores/RecentNodesStore";
import { instantiatePaletteNode } from "../utils/instantiatePaletteNode";
import { shallow } from "zustand/shallow";

/**
 * Hook for creating new nodes in the workflow editor.
 *
 * @example
 * const handleCreateNode = useCreateNode();
 * handleCreateNode(metadata); // at menu position
 * handleCreateNode(metadata, { x: 100, y: 200 }); // at specific position
 */
export const useCreateNode = (
  centerPosition: { x: number; y: number } | undefined = undefined
): ((metadata: NodeMetadata) => void) => {
  const { clickPosition, closeNodeMenu } = useNodeMenuStore(
    useShallow((state) => ({
      clickPosition: state.clickPosition,
      closeNodeMenu: state.closeNodeMenu
    }))
  );
  const reactFlowInstance = useReactFlow();
  const { addNode, createNode, updateNodeData } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode,
    updateNodeData: state.updateNodeData
  }), shallow);
  const addRecentNode = useRecentNodesStore((state) => state.addRecentNode);

  const handleCreateNode = useCallback(
    (metadata: NodeMetadata) => {
      if (!reactFlowInstance) {return;}

      const position = centerPosition ?? clickPosition;
      const rfPos = reactFlowInstance.screenToFlowPosition(position);

      // Snippet virtual nodes → create a real Code node with pre-filled code
      const { node: newNode, afterAdd } = instantiatePaletteNode(
        metadata,
        rfPos,
        createNode
      );
      addNode(newNode);
      if (afterAdd) {
        updateNodeData(newNode.id, afterAdd);
      }

      // Track this node as recently used
      addRecentNode(metadata.node_type);

      // Close the node menu after creating a node
      closeNodeMenu();
    },
    [
      reactFlowInstance,
      centerPosition,
      clickPosition,
      createNode,
      addNode,
      updateNodeData,
      addRecentNode,
      closeNodeMenu
    ]
  );

  return handleCreateNode;
};
