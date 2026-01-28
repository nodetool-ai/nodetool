import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import { shallow } from "zustand/shallow";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { useRecentNodesStore } from "../stores/RecentNodesStore";

/**
 * Custom hook for creating new nodes in the workflow editor.
 * 
 * Handles translating screen coordinates to ReactFlow coordinates and
 * creates nodes with proper metadata and positioning.
 * 
 * @param centerPosition - Optional fixed position for the new node. 
 *                         If not provided, uses the current click position from the node menu.
 * @returns Callback function to create a new node with the given metadata
 * 
 * @example
 * ```typescript
 * const handleCreateNode = useCreateNode();
 * 
 * // Create node at menu position
 * handleCreateNode(metadata);
 * 
 * // Create node at specific position
 * handleCreateNode(metadata, { x: 100, y: 200 });
 * ```
 */
export const useCreateNode = (
  centerPosition: { x: number; y: number } | undefined = undefined
) => {
  const { clickPosition, closeNodeMenu } = useNodeMenuStore(
    (state) => ({
      clickPosition: state.clickPosition,
      closeNodeMenu: state.closeNodeMenu
    }),
    shallow
  );
  const reactFlowInstance = useReactFlow();
  const { addNode, createNode } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode
  }));
  const addRecentNode = useRecentNodesStore((state) => state.addRecentNode);

  const handleCreateNode = useCallback(
    (metadata: NodeMetadata) => {
      if (!reactFlowInstance) {return;}

      const position = centerPosition ?? clickPosition;
      const rfPos = reactFlowInstance.screenToFlowPosition(position);

      const newNode = createNode(metadata, rfPos);
      addNode(newNode);

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
      addRecentNode,
      closeNodeMenu
    ]
  );

  return handleCreateNode;
};
