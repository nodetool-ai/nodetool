import { useCallback } from "react";
import { NodeData } from "../stores/NodeData";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";
import { shallow } from "zustand/shallow";

/** Configuration options for aligning nodes. */
type AlignNodesOptions = {
  /** Whether to arrange nodes with equal spacing between them */
  arrangeSpacing: boolean;
  /** Optional collapsed state to apply to all selected nodes */
  collapsed?: boolean;
};

/**
 * Hook for aligning selected nodes in the workflow editor.
 * 
 * @example
 * const alignNodes = useAlignNodes();
 * alignNodes({ arrangeSpacing: false }); // Simple alignment
 * alignNodes({ arrangeSpacing: true, collapsed: false }); // With spacing
 */
const useAlignNodes = () => {
  const VERTICAL_SPACING = 20;
  const HORIZONTAL_SPACING = 40;
  const store = useNodeStoreRef();
  const { setNodes, getSelectedNodes } = useNodes((state) => ({
    setNodes: state.setNodes,
    getSelectedNodes: state.getSelectedNodes
  }), shallow);

  const alignNodes = useCallback(
    ({ arrangeSpacing, collapsed }: AlignNodesOptions) => {
      const selectedNodes = getSelectedNodes();
      if (selectedNodes.length < 2) {return;}

      // Create maps for O(1) lookups instead of repeated find() calls
      const nodeById = new Map(selectedNodes.map((n) => [n.id, n]));
      const nodeUpdates = new Map<
        string,
        { position: { x: number; y: number }; data: Partial<NodeData> }
      >();

      // Initialize with current positions and ensure data is at least an empty object
      selectedNodes.forEach((node) => {
        nodeUpdates.set(node.id, {
          position: { ...node.position },
          data: { ...(node.data || {}) }
        });
      });

      const xCoordinates = selectedNodes.map((node) => node.position.x);
      const yCoordinates = selectedNodes.map((node) => node.position.y);

      const xRange = Math.max(...xCoordinates) - Math.min(...xCoordinates);
      const yRange = Math.max(...yCoordinates) - Math.min(...yCoordinates);

      const sortedNodeIds = selectedNodes.map((n) => n.id);

      if (xRange < yRange) {
        const leftMostX = Math.min(...xCoordinates);
        sortedNodeIds.sort((idA, idB) => {
          const nodeA = nodeById.get(idA);
          const nodeB = nodeById.get(idB);
          if (!nodeA || !nodeB) {return 0;}
          return nodeA.position.y - nodeB.position.y;
        });

        sortedNodeIds.forEach((nodeId, index) => {
          const update = nodeUpdates.get(nodeId);
          if (!update) {return;}
          update.position.x = leftMostX;
          if (arrangeSpacing && index > 0) {
            const previousNodeId = sortedNodeIds[index - 1];
            const previousNode = nodeById.get(previousNodeId);
            const previousNodeUpdate = nodeUpdates.get(previousNodeId);
            if (!previousNode || !previousNodeUpdate) {return;}
            const previousNodeHeight = previousNode.measured?.height ?? 0;
            update.position.y =
              previousNodeUpdate.position.y +
              previousNodeHeight +
              VERTICAL_SPACING;
          }
        });
      } else {
        const topMostY = Math.min(...yCoordinates);
        sortedNodeIds.sort((idA, idB) => {
          const nodeA = nodeById.get(idA);
          const nodeB = nodeById.get(idB);
          if (!nodeA || !nodeB) {return 0;}
          return nodeA.position.x - nodeB.position.x;
        });

        sortedNodeIds.forEach((nodeId, index) => {
          const update = nodeUpdates.get(nodeId);
          if (!update) {return;}
          update.position.y = topMostY;
          if (arrangeSpacing && index > 0) {
            const previousNodeId = sortedNodeIds[index - 1];
            const previousNode = nodeById.get(previousNodeId);
            const previousNodeUpdate = nodeUpdates.get(previousNodeId);
            if (!previousNode || !previousNodeUpdate) {return;}
            const previousNodeWidth = previousNode.measured?.width ?? 0;
            update.position.x =
              previousNodeUpdate.position.x +
              previousNodeWidth +
              HORIZONTAL_SPACING;
          }
        });
      }

      if (collapsed !== undefined) {
        selectedNodes.forEach((node) => {
          const update = nodeUpdates.get(node.id);
          if (!update) {return;}
          update.data.collapsed = collapsed;
        });
      }

      const { nodes } = store.getState();
      setNodes(
        nodes.map((currentNode) => {
          const updatedProps = nodeUpdates.get(currentNode.id);
          if (updatedProps) {
            return {
              ...currentNode,
              position: { ...updatedProps.position }, // Create a new position object
              data: { ...currentNode.data, ...updatedProps.data } // Create a new data object, merging existing with updates
            };
          }
          return currentNode; // Not a selected node, return as is
        })
      );
    },
    [getSelectedNodes, store, setNodes]
  );

  return alignNodes;
};

export default useAlignNodes;
