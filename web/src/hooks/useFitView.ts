import { useCallback } from "react";
import { useReactFlow, XYPosition } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";

export const useFitView = () => {
  const reactFlowInstance = useReactFlow();
  const { nodes, selectedNodes, setSelectedNodes } = useNodes((state) => ({
    nodes: state.nodes,
    selectedNodes: state.getSelectedNodes(),
    setSelectedNodes: state.setSelectedNodes
  }));
  const TRANSITION_DURATION = 1000;
  return useCallback(() => {
    if (selectedNodes.length) {
      setTimeout(() => {
        setSelectedNodes([]);
      }, 1000);
      const nodesById = nodes.reduce((acc, node) => {
        const pos = {
          x: node.position.x,
          y: node.position.y
        };
        acc[node.id] = pos;
        return acc;
      }, {} as Record<string, XYPosition>);

      const nodePositions = selectedNodes.map((node) => {
        const parent = node.parentId ? nodesById[node.parentId] : null;
        const parentPos = parent
          ? { x: parent.x, y: parent.y }
          : { x: 0, y: 0 };
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

      const padding = 0;
      const bounds = {
        x: xMin - padding,
        y: yMin - padding,
        width: xMax - xMin + padding * 2,
        height: yMax - yMin + padding * 2
      };

      requestAnimationFrame(() => {
        // First call, now with animation
        reactFlowInstance.fitBounds(bounds, {
          duration: TRANSITION_DURATION,
          padding: 0.2
        });

        // Call it again after a very short delay, also with animation
        setTimeout(() => {
          reactFlowInstance.fitBounds(bounds, {
            duration: TRANSITION_DURATION,
            padding: 0.2
          });
        }, 10); // 10ms delay
      });
    } else {
      requestAnimationFrame(() => {
        // First call, now with animation
        reactFlowInstance.fitView({
          duration: TRANSITION_DURATION,
          padding: 0.1
        });

        // Call it again after a very short delay, also with animation
        setTimeout(() => {
          reactFlowInstance.fitView({
            duration: TRANSITION_DURATION,
            padding: 0.1
          });
        }, 10); // 10ms delay
      });
    }
  }, [nodes, selectedNodes, setSelectedNodes, reactFlowInstance]);
};
