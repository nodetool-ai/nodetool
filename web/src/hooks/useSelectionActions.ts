import { useCallback } from "react";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";
import { useSurroundWithGroup } from "./nodes/useSurroundWithGroup";

interface SelectionActionsReturn {
  alignLeft: () => void;
  alignCenter: () => void;
  alignRight: () => void;
  alignTop: () => void;
  alignMiddle: () => void;
  alignBottom: () => void;
  distributeHorizontal: () => void;
  distributeVertical: () => void;
  stackSelected: () => void;
  arrangeGrid: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  groupSelected: () => void;
  bypassSelected: () => void;
}

const NODE_WIDTH = 280;
const HORIZONTAL_SPACING = 40;
const VERTICAL_SPACING = 20;

const getNodeWidth = (node: { measured?: { width?: number } }) =>
  node.measured?.width ?? NODE_WIDTH;
const getNodeHeight = (node: { measured?: { height?: number } }) =>
  node.measured?.height ?? 0;

/** Reading order: top to bottom, then left to right, then id for ties. */
const byReadingOrder = (
  a: { id: string; position: { x: number; y: number } },
  b: { id: string; position: { x: number; y: number } }
) =>
  a.position.y - b.position.y ||
  a.position.x - b.position.x ||
  a.id.localeCompare(b.id);

export const useSelectionActions = (): SelectionActionsReturn => {
  // Use store ref to avoid subscribing to entire nodes/edges arrays
  // Only subscribe to the functions we need
  const setNodes = useNodes((state) => state.setNodes);
  const setEdges = useNodes((state) => state.setEdges);
  const getSelectedNodes = useNodes((state) => state.getSelectedNodes);
  const deleteNodes = useNodes((state) => state.deleteNodes);
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

  const applyPositions = useCallback(
    (positions: Map<string, { x: number; y: number }>) => {
      const { nodes } = store.getState();
      setNodes(
        nodes.map((node) => {
          const position = positions.get(node.id);
          return position ? { ...node, position } : node;
        })
      );
    },
    [setNodes, store]
  );

  const stackSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const sorted = [...selectedNodes].sort(byReadingOrder);
    const left = Math.min(...sorted.map((n) => n.position.x));
    let currentY = Math.min(...sorted.map((n) => n.position.y));

    const positions = new Map<string, { x: number; y: number }>();
    sorted.forEach((node) => {
      positions.set(node.id, { x: left, y: currentY });
      currentY += getNodeHeight(node) + VERTICAL_SPACING;
    });
    applyPositions(positions);
  }, [getSelectedNodes, applyPositions]);

  const arrangeGrid = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const sorted = [...selectedNodes].sort(byReadingOrder);
    const columns = Math.ceil(Math.sqrt(sorted.length));
    const columnWidths = new Array<number>(columns).fill(0);
    const rows = Math.ceil(sorted.length / columns);
    const rowHeights = new Array<number>(rows).fill(0);
    sorted.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      columnWidths[column] = Math.max(columnWidths[column], getNodeWidth(node));
      rowHeights[row] = Math.max(rowHeights[row], getNodeHeight(node));
    });

    const left = Math.min(...sorted.map((n) => n.position.x));
    const top = Math.min(...sorted.map((n) => n.position.y));
    const columnX = columnWidths.map(
      (_, column) =>
        left +
        columnWidths
          .slice(0, column)
          .reduce((sum, width) => sum + width + HORIZONTAL_SPACING, 0)
    );
    const rowY = rowHeights.map(
      (_, row) =>
        top +
        rowHeights
          .slice(0, row)
          .reduce((sum, height) => sum + height + VERTICAL_SPACING, 0)
    );

    const positions = new Map<string, { x: number; y: number }>();
    sorted.forEach((node, index) => {
      positions.set(node.id, {
        x: columnX[index % columns],
        y: rowY[Math.floor(index / columns)]
      });
    });
    applyPositions(positions);
  }, [getSelectedNodes, applyPositions]);

  const deleteSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    deleteNodes(selectedNodes.map((node) => node.id));

    const { edges } = store.getState();
    const selectedEdgeIds = edges
      .filter((edge) => edge.selected)
      .map((edge) => edge.id);
    deleteEdges(selectedEdgeIds);
  }, [getSelectedNodes, deleteNodes, store, deleteEdges]);

  const duplicateSelected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    const offset = 50;

    const nodeIdMap: Record<string, string> = {};
    for (const node of selectedNodes) {
      nodeIdMap[node.id] = crypto.randomUUID();
    }

    const newNodes = selectedNodes.map((node) => {
      const newId = nodeIdMap[node.id];
      const isParentDuplicated = node.parentId
        ? Object.prototype.hasOwnProperty.call(nodeIdMap, node.parentId)
        : false;
      const positionOffset = isParentDuplicated ? 0 : offset;

      return {
        ...node,
        id: newId,
        parentId: isParentDuplicated
          ? nodeIdMap[node.parentId as string]
          : node.parentId,
        position: {
          x: node.position.x + positionOffset,
          y: node.position.y + positionOffset
        },
        selected: true,
        data: { ...node.data }
      };
    });

    const { nodes, edges } = store.getState();

    // Only duplicate edges where both endpoints are among the duplicated nodes.
    const selectedNodeIds = selectedNodes.map((n) => n.id);
    const selectedNodeIdsSet = new Set(selectedNodeIds);
    const newEdges = edges
      .filter(
        (edge) =>
          selectedNodeIdsSet.has(edge.source) &&
          selectedNodeIdsSet.has(edge.target)
      )
      .map((edge) => ({
        ...edge,
        id: crypto.randomUUID(),
        source: nodeIdMap[edge.source],
        target: nodeIdMap[edge.target],
        selected: true
      }));

    const updatedNodes = nodes.map((node) => ({
      ...node,
      selected: false
    }));

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
    stackSelected,
    arrangeGrid,
    deleteSelected,
    duplicateSelected,
    groupSelected,
    bypassSelected
  };
};

export default useSelectionActions;
