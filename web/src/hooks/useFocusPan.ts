import { useCallback, useRef, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";

/**
 * Custom hook for auto-panning to a node when it receives focus via keyboard navigation.
 * 
 * This hook integrates with the keyboard node navigation system, automatically panning
 * the viewport to center the focused node when users navigate using Tab key. It tracks
 * Tab key presses and triggers a smooth pan animation to bring the focused node into view.
 * 
 * @param nodeId - The ID of the node to pan to when focused
 * @returns Focus event handler callback
 * 
 * @example
 * ```typescript
 * // Auto-pan to node when it receives focus
 * const handleFocus = useFocusPan("node-123");
 * 
 * return <div onFocus={handleFocus}>Node Content</div>;
 * ```
 * 
 * @see useNodeFocus - For keyboard navigation functionality
 * @see NodeFocusStore - For focus state management
 */
export const useFocusPan = (nodeId: string) => {
  const wasTabPressedRef = useRef(false);
  const findNode = useNodes((state) => state.findNode);
  const reactFlowInstance = useReactFlow();
  const PAN_DURATION = 200;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        wasTabPressedRef.current = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        wasTabPressedRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleFocus = useCallback(
    (_e: React.FocusEvent<HTMLElement>) => {
      if (wasTabPressedRef.current) {
        const node = findNode(nodeId);
        if (node) {
          const { zoom } = reactFlowInstance.getViewport();
          reactFlowInstance.setCenter(node.position.x, node.position.y, {
            duration: PAN_DURATION,
            zoom: zoom
          });
        }
      }
    },
    [findNode, nodeId, reactFlowInstance]
  );

  return handleFocus;
};
