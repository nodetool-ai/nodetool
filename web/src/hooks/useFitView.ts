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
  const SECOND_CALL_DELAY = 20;

  return useCallback(
    (options?: { padding?: number }) => {
      console.log("%c[useFitView] Triggered", "color: #00A86B;");
      const padding = options?.padding ?? 0.1;
      const nodesToFit = selectedNodes.length > 0 ? selectedNodes : nodes;

      if (nodesToFit.length === 0) {
        reactFlowInstance.fitView({ duration: TRANSITION_DURATION, padding });
        return;
      }

      if (selectedNodes.length > 0) {
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

        setTimeout(
          () => {
            reactFlowInstance.fitBounds(bounds, {
              duration: TRANSITION_DURATION,
              padding: padding
            });
          },
          selectedNodes.length > 0 ? 10 : SECOND_CALL_DELAY
        );
      });

      // After the animation, get the new viewport and save it.
      setTimeout(() => {
        const newViewport = reactFlowInstance.getViewport();
        console.log(
          "%c[useFitView] Saving new viewport after fit",
          "color: #00A86B;",
          newViewport
        );
        setViewport(newViewport);
      }, TRANSITION_DURATION + SECOND_CALL_DELAY + 100); // Wait for animations to finish
    },
    [nodes, selectedNodes, setSelectedNodes, reactFlowInstance, setViewport]
  );
};
