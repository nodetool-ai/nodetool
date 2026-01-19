import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { useSurroundWithGroup } from "./nodes/useSurroundWithGroup";

/**
 * Custom hook providing batch operations for selected nodes in the workflow editor.
 * 
 * This hook provides a comprehensive set of alignment, distribution, and manipulation
 * actions for multiple selected nodes including:
 * - Alignment: Left, Center, Right, Top, Middle, Bottom
 * - Distribution: Horizontal and vertical spacing
 * - Operations: Delete, Duplicate, Group, Bypass
 * 
 * All operations work with the currently selected nodes retrieved via getSelectedNodes().
 * Actions that require multiple nodes (align, distribute) will silently do nothing if
 * fewer than 2 nodes are selected.
 * 
 * @returns SelectionActionsReturn object containing all batch operation callbacks
 * 
 * @example
 * ```typescript
 * const { alignLeft, distributeHorizontal, deleteSelected } = useSelectionActions();
 * 
 * // Align selected nodes to the left edge
 * alignLeft();
 * 
 * // Distribute selected nodes evenly
 * distributeHorizontal();
 * 
 * // Delete all selected nodes
 * deleteSelected();
 * ```
 * 
 * @see useAlignNodes - For single-node alignment with grid snapping
 * @see useDuplicateNodes - For duplicating individual nodes
 */
interface SelectionActionsReturn {
  alignLeft: () => void;
  alignCenter: () => void;
  alignRight: () => void;
  alignTop: () => void;
  alignMiddle: () => void;
  alignBottom: () => void;
  distributeHorizontal: () => void;
  distributeVertical: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  groupSelected: () => void;
  bypassSelected: () => void;
}

/**
 * Custom hook providing selection-based node actions.
 * 
 * Provides alignment (left, center, right, top, middle, bottom),
 * distribution (horizontal, vertical), and manipulation actions
 * (delete, duplicate, group, bypass) for selected nodes.
 * 
 * @returns Object containing all selection action functions
 * 
 * @example
 * ```typescript
 * const {
 *   alignLeft,
 *   distributeHorizontal,
 *   deleteSelected
 * } = useSelectionActions();
 * ```
 */
const NODE_WIDTH = 280;
const HORIZONTAL_SPACING = 40;
const VERTICAL_SPACING = 20;

const getNodeWidth = (node: { measured?: { width?: number } }) =>
  node.measured?.width ?? NODE_WIDTH;
const getNodeHeight = (node: { measured?: { height?: number } }) =>
  node.measured?.height ?? 0;

export const useSelectionActions = (): SelectionActionsReturn => {
  const getSelectedNodes = useNodes((state) => state.getSelectedNodes);
  const deleteNode = useNodes((state) => state.deleteNode);
  const toggleBypassSelected = useNodes((state) => state.toggleBypassSelected);
  const reactFlow = useReactFlow();
  const surroundWithGroup = useSurroundWithGroup();

  const alignLeft = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const leftMostX = Math.min(...selectedNodes.map((n) => n.position.x));

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          return { ...node, position: { ...node.position, x: leftMostX } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const alignCenter = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    // Calculate the average center X position
    const avgCenterX =
      selectedNodes.reduce((sum, n) => {
        const nodeWidth = n.measured?.width ?? NODE_WIDTH;
        return sum + n.position.x + nodeWidth / 2;
      }, 0) / selectedNodes.length;

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          const nodeWidth = node.measured?.width ?? NODE_WIDTH;
          return {
            ...node,
            position: { ...node.position, x: avgCenterX - nodeWidth / 2 }
          };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const alignRight = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const rightMostX = Math.max(
      ...selectedNodes.map(
        (n) => n.position.x + (n.measured?.width ?? NODE_WIDTH)
      )
    );

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          const nodeWidth = node.measured?.width ?? NODE_WIDTH;
          return {
            ...node,
            position: { ...node.position, x: rightMostX - nodeWidth }
          };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const alignTop = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const topMostY = Math.min(...selectedNodes.map((n) => n.position.y));

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          return { ...node, position: { ...node.position, y: topMostY } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const alignMiddle = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    // Calculate the average center Y position
    const avgCenterY =
      selectedNodes.reduce((sum, n) => {
        const nodeHeight = n.measured?.height ?? 0;
        return sum + n.position.y + nodeHeight / 2;
      }, 0) / selectedNodes.length;

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          const nodeHeight = node.measured?.height ?? 0;
          return {
            ...node,
            position: { ...node.position, y: avgCenterY - nodeHeight / 2 }
          };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const alignBottom = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const bottomMostY = Math.max(
      ...selectedNodes.map((n) => n.position.y + (n.measured?.height ?? 0))
    );

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.selected) {
          const nodeHeight = node.measured?.height ?? 0;
          return {
            ...node,
            position: { ...node.position, y: bottomMostY - nodeHeight }
          };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const distributeHorizontal = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const sortedByX = [...selectedNodes].sort((a, b) => {
      const delta = a.position.x - b.position.x;
      if (delta !== 0) {
        return delta;
      }
      return a.id.localeCompare(b.id);
    });

    const leftMostX = Math.min(...sortedByX.map((n) => n.position.x));

    const positionMap = new Map<string, number>();
    let currentX = leftMostX;
    sortedByX.forEach((node) => {
      positionMap.set(node.id, currentX);
      currentX += getNodeWidth(node) + HORIZONTAL_SPACING;
    });

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const newX = positionMap.get(node.id);
        if (newX !== undefined) {
          return { ...node, position: { ...node.position, x: newX } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const distributeVertical = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const sortedByY = [...selectedNodes].sort((a, b) => {
      const delta = a.position.y - b.position.y;
      if (delta !== 0) {
        return delta;
      }
      return a.id.localeCompare(b.id);
    });

    const topMostY = Math.min(...sortedByY.map((n) => n.position.y));

    const positionMap = new Map<string, number>();
    let currentY = topMostY;
    sortedByY.forEach((node) => {
      positionMap.set(node.id, currentY);
      currentY += getNodeHeight(node) + VERTICAL_SPACING;
    });

    reactFlow.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const newY = positionMap.get(node.id);
        if (newY !== undefined) {
          return { ...node, position: { ...node.position, y: newY } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, reactFlow]);

  const deleteSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    selectedNodes.forEach((node) => {
      deleteNode(node.id);
    });
  }, [getSelectedNodes, deleteNode]);

  const duplicateSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    // Use larger offset for better spacing
    const offset = 50;

    reactFlow.setNodes((currentNodes) => {
      const newNodes: typeof currentNodes = [];
      const nodeIdMap: Record<string, string> = {};

      selectedNodes.forEach((node) => {
        const newId = `${node.id}_copy_${Date.now()}`;
        nodeIdMap[node.id] = newId;

        newNodes.push({
          ...node,
          id: newId,
          position: {
            x: node.position.x + offset,
            y: node.position.y + offset
          },
          selected: true,
          data: { ...node.data }
        });
      });

      const newEdges = reactFlow.getEdges().map((edge) => {
        if (nodeIdMap[edge.source] && nodeIdMap[edge.target]) {
          return {
            ...edge,
            id: `${edge.id}_copy`,
            source: nodeIdMap[edge.source],
            target: nodeIdMap[edge.target],
            selected: true
          };
        }
        return { ...edge, selected: false };
      });

      reactFlow.setEdges(newEdges);

      // Deselect original nodes, keep only new nodes selected
      return [
        ...currentNodes.map((node) =>
          node.selected ? { ...node, selected: false } : node
        ),
        ...newNodes
      ];
    });
  }, [getSelectedNodes, reactFlow]);

  const groupSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    surroundWithGroup({ selectedNodes });
  }, [getSelectedNodes, surroundWithGroup]);

  const bypassSelected = useCallback(() => {
    toggleBypassSelected();
  }, [toggleBypassSelected]);

  return {
    alignLeft,
    alignCenter,
    alignRight,
    alignTop,
    alignMiddle,
    alignBottom,
    distributeHorizontal,
    distributeVertical,
    deleteSelected,
    duplicateSelected,
    groupSelected,
    bypassSelected
  };
};

export default useSelectionActions;
