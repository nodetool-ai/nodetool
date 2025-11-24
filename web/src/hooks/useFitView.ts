import { useCallback } from "react";
import { useReactFlow, XYPosition, Node } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { NodeData } from "../stores/NodeData";

const EXTRA_LEFT_PADDING = 100;
const TOP_PADDING_ADJUSTMENT = 50;

function getNodesBounds(
  nodesToBound: Node<NodeData>[],
  nodesById: Record<string, XYPosition>
) {
  if (nodesToBound.length === 0) {
    return null;
  }

  const nodePositions = nodesToBound.map((node) => {
    const parent = node.parentId ? nodesById[node.parentId] : null;
    const parentPos = parent ? { x: parent.x, y: parent.y } : { x: 0, y: 0 };
    return {
      x: node.position.x + parentPos.x,
      y: node.position.y + parentPos.y,
      width: node.measured?.width || 0,
      height: node.measured?.height || 0
    };
  });

  const xMin = Math.min(...nodePositions.map((pos) => pos.x));
  const xMax = Math.max(...nodePositions.map((pos) => pos.x + pos.width));
  const yMin = Math.min(...nodePositions.map((pos) => pos.y));
  const yMax = Math.max(...nodePositions.map((pos) => pos.y + pos.height));

  return { xMin, xMax, yMin, yMax };
}

export const useFitView = () => {
  const reactFlowInstance = useReactFlow();
  const { nodes, selectedNodes, setSelectedNodes, setViewport } = useNodes(
    (state) => ({
      nodes: state.nodes,
      selectedNodes: state.getSelectedNodes(),
      setSelectedNodes: state.setSelectedNodes,
      setViewport: state.setViewport
    })
  );
  const TRANSITION_DURATION = 800;

  // A short delay for the second fitBounds call when nodes are selected.
  const FIT_BOUNDS_DELAY_SELECTED = 10;
  // A slightly longer delay for the second fitBounds call for the general case.
  const FIT_BOUNDS_DELAY_DEFAULT = 20;

  return useCallback(
    (options?: { padding?: number; nodeIds?: string[] }) => {
      const padding = options?.padding ?? 0.1;
      const explicitNodeIds = options?.nodeIds ?? [];

      const nodesToFit =
        explicitNodeIds.length > 0
          ? nodes.filter((n) => explicitNodeIds.includes(n.id))
          : selectedNodes.length > 0
          ? selectedNodes
          : nodes;

      if (nodesToFit.length === 0) {
        reactFlowInstance.fitView({ duration: TRANSITION_DURATION, padding });
        return;
      }

      // Only auto-deselect if more than 1 node is selected
      //  if (!explicitNodeIds.length && selectedNodes.length == 1) {
      if (selectedNodes.length > 1) {
        setTimeout(() => {
          setSelectedNodes([]);
        }, TRANSITION_DURATION - 300);
      }

      const nodesById = nodes.reduce((acc, node) => {
        const pos = {
          x: node.position.x,
          y: node.position.y
        };
        acc[node.id] = pos;
        return acc;
      }, {} as Record<string, XYPosition>);

      const boundsInfo = getNodesBounds(nodesToFit, nodesById);
      if (!boundsInfo) {
        return;
      }

      const { xMin, xMax, yMin, yMax } = boundsInfo;

      const bounds = {
        x: xMin - EXTRA_LEFT_PADDING,
        y: yMin,
        width: xMax - xMin + EXTRA_LEFT_PADDING,
        height: yMax - yMin + TOP_PADDING_ADJUSTMENT
      };

      requestAnimationFrame(() => {
        reactFlowInstance.fitBounds(bounds, {
          duration: TRANSITION_DURATION,
          padding: padding
        });

        // The second fitBounds call is a necessary workaround. After the first call,
        // nodes may not have their final dimensions calculated, especially with dynamic
        // content. This second call, after a short delay, ensures the view is fitted
        // to the correct, final bounds. Without it, sometimes two manual fits were required.
        setTimeout(
          () => {
            reactFlowInstance.fitBounds(bounds, {
              duration: TRANSITION_DURATION,
              padding: padding
            });
          },
          explicitNodeIds.length > 0 || selectedNodes.length > 0
            ? FIT_BOUNDS_DELAY_SELECTED
            : FIT_BOUNDS_DELAY_DEFAULT
        );
      });

      // After the animation, get the new viewport and save it.
      setTimeout(() => {
        const newViewport = reactFlowInstance.getViewport();
        setViewport(newViewport);
      }, TRANSITION_DURATION + FIT_BOUNDS_DELAY_DEFAULT + 100); // Wait for animations to finish
    },
    // [nodes, selectedNodes, setSelectedNodes, reactFlowInstance, setViewport]
    [nodes, selectedNodes, reactFlowInstance, setSelectedNodes, setViewport]
  );
};
