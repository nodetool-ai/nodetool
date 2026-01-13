import { useCallback, useMemo } from "react";
import { XYPosition, Node } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { NodeData } from "../stores/NodeData";

export interface CanvasBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
  center: XYPosition;
  hasNodes: boolean;
}

export interface UseCanvasBoundsOptions {
  includePadding?: boolean;
  padding?: number;
}

const DEFAULT_PADDING = 100;
const DEFAULT_INCLUDE_PADDING = true;

function calculateBounds(
  nodes: Node<NodeData>[],
  nodesById: Record<string, XYPosition>,
  includePadding: boolean,
  padding: number
): CanvasBounds | null {
  if (nodes.length === 0) {
    return null;
  }

  const nodePositions = nodes.map((node) => {
    const parent = node.parentId ? nodesById[node.parentId] : null;
    const parentPos = parent ? { x: parent.x, y: parent.y } : { x: 0, y: 0 };
    return {
      x: node.position.x + parentPos.x,
      y: node.position.y + parentPos.y,
      width: node.measured?.width || 280,
      height: node.measured?.height || 0
    };
  });

  const xMin = Math.min(...nodePositions.map((pos) => pos.x));
  const xMax = Math.max(...nodePositions.map((pos) => pos.x + pos.width));
  const yMin = Math.min(...nodePositions.map((pos) => pos.y));
  const yMax = Math.max(...nodePositions.map((pos) => pos.y + pos.height));

  const effectivePadding = includePadding ? padding : 0;
  const width = xMax - xMin + effectivePadding * 2;
  const height = yMax - yMin + effectivePadding;
  const center = {
    x: xMin - effectivePadding + width / 2,
    y: yMin - effectivePadding / 2 + height / 2
  };

  return {
    xMin: xMin - effectivePadding,
    xMax: xMax + effectivePadding,
    yMin: yMin - effectivePadding / 2,
    yMax: yMax + effectivePadding / 2,
    width,
    height,
    center,
    hasNodes: true
  };
}

export const useCanvasBounds = (options: UseCanvasBoundsOptions = {}) => {
  const { includePadding = DEFAULT_INCLUDE_PADDING, padding = DEFAULT_PADDING } = options;

  const { nodes } = useNodes((state) => ({
    nodes: state.nodes
  }));

  const nodesById = useMemo(() => {
    return nodes.reduce((acc, node) => {
      const pos = {
        x: node.position.x,
        y: node.position.y
      };
      acc[node.id] = pos;
      return acc;
    }, {} as Record<string, XYPosition>);
  }, [nodes]);

  const bounds = useMemo(() => {
    return calculateBounds(nodes, nodesById, includePadding, padding);
  }, [nodes, nodesById, includePadding, padding]);

  const getBoundsForNodes = useCallback(
    (nodeIds: string[]) => {
      const nodesToBound = nodes.filter((n) => nodeIds.includes(n.id));
      return calculateBounds(nodesToBound, nodesById, includePadding, padding);
    },
    [nodes, nodesById, includePadding, padding]
  );

  const getBoundsForSelectedNodes = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    return calculateBounds(selectedNodes, nodesById, includePadding, padding);
  }, [nodes, nodesById, includePadding, padding]);

  const getBoundsForNodeType = useCallback(
    (nodeType: string) => {
      const nodesOfType = nodes.filter((n) => n.type === nodeType);
      return calculateBounds(nodesOfType, nodesById, includePadding, padding);
    },
    [nodes, nodesById, includePadding, padding]
  );

  const isNodeInView = useCallback(
    (nodeId: string, viewport: { x: number; y: number; zoom: number }) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node || !bounds) {
        return false;
      }

      const nodeWidth = (node.measured?.width || 280) * viewport.zoom;
      const nodeHeight = (node.measured?.height || 0) * viewport.zoom;

      const nodeScreenX = (node.position.x + viewport.x) * viewport.zoom;
      const nodeScreenY = (node.position.y + viewport.y) * viewport.zoom;

      const reactFlowWrapper = document.querySelector(".react-flow");
      if (!reactFlowWrapper) {
        return false;
      }

      const canvasRect = reactFlowWrapper.getBoundingClientRect();
      const screenCanvasX = canvasRect.left;
      const screenCanvasY = canvasRect.top;

      const nodeGlobalX = screenCanvasX + nodeScreenX;
      const nodeGlobalY = screenCanvasY + nodeScreenY;

      return (
        nodeGlobalX >= screenCanvasX &&
        nodeGlobalX + nodeWidth <= screenCanvasX + canvasRect.width &&
        nodeGlobalY >= screenCanvasY &&
        nodeGlobalY + nodeHeight <= screenCanvasY + canvasRect.height
      );
    },
    [nodes, bounds]
  );

  return {
    bounds,
    getBoundsForNodes,
    getBoundsForSelectedNodes,
    getBoundsForNodeType,
    isNodeInView,
    nodeCount: nodes.length,
    selectedNodeCount: nodes.filter((n) => n.selected).length
  };
};
