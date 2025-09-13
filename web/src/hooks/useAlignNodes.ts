import { useCallback } from "react";
import { Node, useReactFlow } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { useNodes } from "../contexts/NodeContext";

type AlignNodesOptions = {
  arrangeSpacing: boolean;
  collapsed?: boolean;
};

const useAlignNodes = () => {
  const VERTICAL_SPACING = 20;
  const HORIZONTAL_SPACING = 40;
  const getSelectedNodes = useNodes((state) => state.getSelectedNodes);
  const reactFlow = useReactFlow();

  const alignNodes = useCallback(
    ({ arrangeSpacing, collapsed }: AlignNodesOptions) => {
      const selectedNodes = getSelectedNodes();
      if (selectedNodes.length < 2) return;

      // Create a map to store the changes for each node
      const nodeUpdates = new Map<
        string,
        { position: { x: number; y: number }; data: Partial<NodeData> }
      >();

      // Initialize with current positions and ensure data is at least an empty object
      selectedNodes.forEach((node) => {
        nodeUpdates.set(node.id, {
          position: { ...node.position }, // New position object
          data: { ...(node.data || {}) } // New data object, ensure it exists
        });
      });

      const xCoordinates = selectedNodes.map((node) => node.position.x);
      const yCoordinates = selectedNodes.map((node) => node.position.y);

      const xRange = Math.max(...xCoordinates) - Math.min(...xCoordinates);
      const yRange = Math.max(...yCoordinates) - Math.min(...yCoordinates);

      // Create a sorted list of node IDs for processing alignment
      // We operate on the `nodeUpdates` map using these sorted IDs
      const sortedNodeIds = selectedNodes.map((n) => n.id);

      if (xRange < yRange) {
        // Align left
        const leftMostX = Math.min(...xCoordinates);
        // Sort nodes by original y position for processing order
        sortedNodeIds.sort((idA, idB) => {
          const nodeA = selectedNodes.find((n) => n.id === idA)!;
          const nodeB = selectedNodes.find((n) => n.id === idB)!;
          return nodeA.position.y - nodeB.position.y;
        });

        sortedNodeIds.forEach((nodeId, index) => {
          const update = nodeUpdates.get(nodeId)!;
          update.position.x = leftMostX;
          if (arrangeSpacing && index > 0) {
            const previousNodeId = sortedNodeIds[index - 1];
            const previousNodeOriginal = selectedNodes.find(
              (n) => n.id === previousNodeId
            )!;
            const previousNodeHeight =
              previousNodeOriginal.measured?.height ?? 0;
            const previousNodeUpdate = nodeUpdates.get(previousNodeId)!;
            update.position.y =
              previousNodeUpdate.position.y +
              previousNodeHeight +
              VERTICAL_SPACING;
          }
        });
      } else {
        // Align top
        const topMostY = Math.min(...yCoordinates);
        // Sort nodes by original x position for processing order
        sortedNodeIds.sort((idA, idB) => {
          const nodeA = selectedNodes.find((n) => n.id === idA)!;
          const nodeB = selectedNodes.find((n) => n.id === idB)!;
          return nodeA.position.x - nodeB.position.x;
        });

        sortedNodeIds.forEach((nodeId, index) => {
          const update = nodeUpdates.get(nodeId)!;
          update.position.y = topMostY;
          if (arrangeSpacing && index > 0) {
            const previousNodeId = sortedNodeIds[index - 1];
            const previousNodeOriginal = selectedNodes.find(
              (n) => n.id === previousNodeId
            )!;
            const previousNodeWidth = previousNodeOriginal.measured?.width ?? 0;
            const previousNodeUpdate = nodeUpdates.get(previousNodeId)!;
            update.position.x =
              previousNodeUpdate.position.x +
              previousNodeWidth +
              HORIZONTAL_SPACING;
          }
        });
      }

      // Set collapsed state in the updates map
      if (collapsed !== undefined) {
        selectedNodes.forEach((node) => {
          const update = nodeUpdates.get(node.id)!;
          update.data.collapsed = collapsed;
        });
      }

      // Update React Flow nodes
      reactFlow.setNodes((currentNodes) =>
        currentNodes.map((currentNode) => {
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
    [getSelectedNodes, reactFlow]
  );

  return alignNodes;
};

export default useAlignNodes;
