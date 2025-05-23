import { useCallback } from "react";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";

export const useRemoveFromGroup = () => {
  // Get findNode to access parent position
  const { updateNode, findNode } = useNodes((state) => ({
    updateNode: state.updateNode,
    findNode: state.findNode
  }));

  const removeFromGroup = useCallback(
    (nodesToRemove?: Node<NodeData>[]) => {
      if (!nodesToRemove || nodesToRemove.length === 0) return;

      try {
        // Process nodes grouped by their parent
        const nodesByParent: Record<string, Node<NodeData>[]> = {};
        nodesToRemove.forEach((node) => {
          if (node.parentId) {
            if (!nodesByParent[node.parentId]) {
              nodesByParent[node.parentId] = [];
            }
            nodesByParent[node.parentId].push(node);
          }
        });

        // Update nodes for each parent group
        Object.keys(nodesByParent).forEach((parentId) => {
          const parentNode = findNode(parentId);
          // Ensure parent node exists and has a position
          if (!parentNode || parentNode.position === undefined) {
            console.warn(
              `Parent node ${parentId} not found or has no position.`
            );
            return; // Skip if parent is invalid
          }

          const children = nodesByParent[parentId];
          children.forEach((node) => {
            // Calculate new absolute position
            const absolutePosition = {
              x: (parentNode.position.x || 0) + (node.position?.x || 0),
              y: (parentNode.position.y || 0) + (node.position?.y || 0)
            };

            updateNode(node.id, {
              parentId: undefined,
              position: absolutePosition,
              expandParent: false
            });
          });
        });
      } finally {
        // Always resume history tracking
        // resume(); // HISTORY MANAGEMENT MOVED TO DRAG HANDLERS
      }
    },
    // Add pause and resume to dependencies
    [updateNode, findNode]
  );

  return removeFromGroup;
};
