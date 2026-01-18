import { useCallback, useRef, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";

/**
 * Custom hook for panning the viewport to a node when it receives focus via keyboard navigation.
 * 
 * This hook enables smooth viewport transitions when users navigate to nodes
 * using keyboard shortcuts (Tab/Shift+Tab). It tracks Tab key presses and
 * triggers a pan animation to center the focused node in the viewport.
 * 
 * The hook uses a ref to detect when focus events are triggered by keyboard
 * navigation (vs mouse clicks) to only pan when appropriate.
 * 
 * @param nodeId - The ID of the node to pan to when focused
 * @returns Focus event handler callback
 * 
 * @example
 * ```typescript
 * const handleFocus = useFocusPan('node-123');
 * 
 * return (
 *   <BaseNode
 *     id="node-123"
 *     onFocus={handleFocus}
 *   />
 * );
 * ```
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
