import { useCallback } from "react";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";
import { useSurroundWithGroup } from "./nodes/useSurroundWithGroup";
import {
  applyAbsolutePositions,
  layoutSelection
} from "../utils/selectionLayout";

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

  // Group children store positions relative to their group, so layout works
  // in canvas coordinates and writes each result back relative to its parent.
  // A child of a selected group is left out: it moves with the group.
  const getLayoutNodes = useCallback(
    () => layoutSelection(getSelectedNodes(), store.getState().nodes),
    [getSelectedNodes, store]
  );

  const applyPositions = useCallback(
    (positions: Map<string, { x: number; y: number }>) => {
      setNodes(applyAbsolutePositions(store.getState().nodes, positions));
    },
    [setNodes, store]
  );

  const alignLeft = useCallback(() => {
    const selectedNodes = getLayoutNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const leftMostX = Math.min(...selectedNodes.map((n) => n.position.x));
    applyPositions(
      new Map(
        selectedNodes.map((n) => [n.id, { x: leftMostX, y: n.position.y }])
      )
    );
  }, [getLayoutNodes, applyPositions]);

  const alignCenter = useCallback(() => {
    const selectedNodes = getLayoutNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const avgCenterX =
      selectedNodes.reduce(
        (sum, n) => sum + n.position.x + getNodeWidth(n) / 2,
        0
      ) / selectedNodes.length;

    applyPositions(
      new Map(
        selectedNodes.map((n) => [
          n.id,
          { x: avgCenterX - getNodeWidth(n) / 2, y: n.position.y }
        ])
      )
    );
  }, [getLayoutNodes, applyPositions]);

  const alignRight = useCallback(() => {
    const selectedNodes = getLayoutNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const rightMostX = Math.max(
      ...selectedNodes.map((n) => n.position.x + getNodeWidth(n))
    );

    applyPositions(
      new Map(
        selectedNodes.map((n) => [
          n.id,
          { x: rightMostX - getNodeWidth(n), y: n.position.y }
        ])
      )
    );
  }, [getLayoutNodes, applyPositions]);

  const alignTop = useCallback(() => {
    const selectedNodes = getLayoutNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const topMostY = Math.min(...selectedNodes.map((n) => n.position.y));
    applyPositions(
      new Map(
        selectedNodes.map((n) => [n.id, { x: n.position.x, y: topMostY }])
      )
    );
  }, [getLayoutNodes, applyPositions]);

  const alignMiddle = useCallback(() => {
    const selectedNodes = getLayoutNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const avgCenterY =
      selectedNodes.reduce(
        (sum, n) => sum + n.position.y + getNodeHeight(n) / 2,
        0
      ) / selectedNodes.length;

    applyPositions(
      new Map(
        selectedNodes.map((n) => [
          n.id,
          { x: n.position.x, y: avgCenterY - getNodeHeight(n) / 2 }
        ])
      )
    );
  }, [getLayoutNodes, applyPositions]);

  const alignBottom = useCallback(() => {
    const selectedNodes = getLayoutNodes();
    if (selectedNodes.length < 2) {
      return;
    }

    const bottomMostY = Math.max(
      ...selectedNodes.map((n) => n.position.y + getNodeHeight(n))
    );

    applyPositions(
      new Map(
        selectedNodes.map((n) => [
          n.id,
          { x: n.position.x, y: bottomMostY - getNodeHeight(n) }
        ])
      )
    );
  }, [getLayoutNodes, applyPositions]);

  const distributeHorizontal = useCallback(() => {
    const selectedNodes = getLayoutNodes();
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

    const positions = new Map<string, { x: number; y: number }>();
    let currentX = Math.min(...sortedByX.map((n) => n.position.x));
    sortedByX.forEach((node) => {
      positions.set(node.id, { x: currentX, y: node.position.y });
      currentX += getNodeWidth(node) + HORIZONTAL_SPACING;
    });
    applyPositions(positions);
  }, [getLayoutNodes, applyPositions]);

  const distributeVertical = useCallback(() => {
    const selectedNodes = getLayoutNodes();
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

    const positions = new Map<string, { x: number; y: number }>();
    let currentY = Math.min(...sortedByY.map((n) => n.position.y));
    sortedByY.forEach((node) => {
      positions.set(node.id, { x: node.position.x, y: currentY });
      currentY += getNodeHeight(node) + VERTICAL_SPACING;
    });
    applyPositions(positions);
  }, [getLayoutNodes, applyPositions]);

  const stackSelected = useCallback(() => {
    const selectedNodes = getLayoutNodes();
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
  }, [getLayoutNodes, applyPositions]);

  const arrangeGrid = useCallback(() => {
    const selectedNodes = getLayoutNodes();
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
  }, [getLayoutNodes, applyPositions]);

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
