import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";
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
  // Use store ref to avoid subscribing to entire nodes/edges arrays
  // Only subscribe to the functions we need
  const setNodes = useNodes((state) => state.setNodes);
  const setEdges = useNodes((state) => state.setEdges);
  const getSelectedNodes = useNodes((state) => state.getSelectedNodes);
  const deleteNode = useNodes((state) => state.deleteNode);
  const deleteEdges = useNodes((state) => state.deleteEdges);
  const toggleBypassSelected = useNodes((state) => state.toggleBypassSelected);
  const store = useNodeStoreRef();
  const surroundWithGroup = useSurroundWithGroup();

  const alignLeft = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const leftMostX = Math.min(...selectedNodes.map((n) => n.position.x));
    const selectedIds = new Set(selectedNodes.map((n) => n.id));

    const { nodes } = store.getState();
    setNodes(
      nodes.map((node) => {
        if (selectedIds.has(node.id)) {
          return { ...node, position: { ...node.position, x: leftMostX } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, setNodes, store]);

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

    const selectedIds = new Set(selectedNodes.map((n) => n.id));

    const { nodes } = store.getState();
    setNodes(
      nodes.map((node) => {
        if (selectedIds.has(node.id)) {
          const nodeWidth = node.measured?.width ?? NODE_WIDTH;
          return {
            ...node,
            position: { ...node.position, x: avgCenterX - nodeWidth / 2 }
          };
        }
        return node;
      })
    );
  }, [getSelectedNodes, setNodes, store]);

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

    const selectedIds = new Set(selectedNodes.map((n) => n.id));

    const { nodes } = store.getState();
    setNodes(
      nodes.map((node) => {
        if (selectedIds.has(node.id)) {
          const nodeWidth = node.measured?.width ?? NODE_WIDTH;
          return {
            ...node,
            position: { ...node.position, x: rightMostX - nodeWidth }
          };
        }
        return node;
      })
    );
  }, [getSelectedNodes, setNodes, store]);

  const alignTop = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const topMostY = Math.min(...selectedNodes.map((n) => n.position.y));
    const selectedIds = new Set(selectedNodes.map((n) => n.id));

    const { nodes } = store.getState();
    setNodes(
      nodes.map((node) => {
        if (selectedIds.has(node.id)) {
          return { ...node, position: { ...node.position, y: topMostY } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, setNodes, store]);

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

    const selectedIds = new Set(selectedNodes.map((n) => n.id));

    const { nodes } = store.getState();
    setNodes(
      nodes.map((node) => {
        if (selectedIds.has(node.id)) {
          const nodeHeight = node.measured?.height ?? 0;
          return {
            ...node,
            position: { ...node.position, y: avgCenterY - nodeHeight / 2 }
          };
        }
        return node;
      })
    );
  }, [getSelectedNodes, setNodes, store]);

  const alignBottom = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const bottomMostY = Math.max(
      ...selectedNodes.map((n) => n.position.y + (n.measured?.height ?? 0))
    );

    const selectedIds = new Set(selectedNodes.map((n) => n.id));

    const { nodes } = store.getState();
    setNodes(
      nodes.map((node) => {
        if (selectedIds.has(node.id)) {
          const nodeHeight = node.measured?.height ?? 0;
          return {
            ...node,
            position: { ...node.position, y: bottomMostY - nodeHeight }
          };
        }
        return node;
      })
    );
  }, [getSelectedNodes, setNodes, store]);

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

    const { nodes } = store.getState();
    setNodes(
      nodes.map((node) => {
        const newX = positionMap.get(node.id);
        if (newX !== undefined) {
          return { ...node, position: { ...node.position, x: newX } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, setNodes, store]);

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

    const { nodes } = store.getState();
    setNodes(
      nodes.map((node) => {
        const newY = positionMap.get(node.id);
        if (newY !== undefined) {
          return { ...node, position: { ...node.position, y: newY } };
        }
        return node;
      })
    );
  }, [getSelectedNodes, setNodes, store]);

  const deleteSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    selectedNodes.forEach((node) => {
      deleteNode(node.id);
    });

    const { edges } = store.getState();
    const selectedEdgeIds = edges
      .filter((edge) => edge.selected)
      .map((edge) => edge.id);
    deleteEdges(selectedEdgeIds);
  }, [getSelectedNodes, deleteNode, store, deleteEdges]);

  const duplicateSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    // Use larger offset for better spacing
    const offset = 50;

    const nodeIdMap: Record<string, string> = {};
    const newNodes = selectedNodes.map((node) => {
      const newId = uuidv4();
      nodeIdMap[node.id] = newId;

      return {
        ...node,
        id: newId,
        position: {
          x: node.position.x + offset,
          y: node.position.y + offset
        },
        selected: true,
        data: { ...node.data }
      };
    });

    // Get current state from store
    const { nodes, edges } = store.getState();

    // Create new edges for duplicated nodes (only for edges where both nodes are duplicated)
    const selectedNodeIds = selectedNodes.map((n) => n.id);
    const newEdges = edges
      .filter(
        (edge) =>
          selectedNodeIds.includes(edge.source) &&
          selectedNodeIds.includes(edge.target)
      )
      .map((edge) => ({
        ...edge,
        id: uuidv4(),
        source: nodeIdMap[edge.source],
        target: nodeIdMap[edge.target],
        selected: true
      }));

    // Deselect original nodes and add new duplicated nodes
    const updatedNodes = nodes.map((node) => ({
      ...node,
      selected: false
    }));

    // Update state using NodeStore (not ReactFlow directly)
    setNodes([...updatedNodes, ...newNodes]);
    setEdges([...edges, ...newEdges]);
  }, [getSelectedNodes, setNodes, setEdges, store]);

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
