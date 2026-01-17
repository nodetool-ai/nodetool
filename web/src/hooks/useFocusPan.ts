import { useCallback, useRef, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";

/**
 * Hook for keyboard-focused node panning in the workflow editor.
 * 
 * Pans the viewport to center a specific node when that node receives focus
 * via keyboard navigation (Tab key). This ensures the focused node is always
 * visible in the viewport when navigating through the workflow using keyboard.
 * 
 * @param nodeId - The ID of the node to pan to when focused
 * @returns Callback function to be attached to the node's onFocus event
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
 * 
 * @remarks
 * This hook integrates with the keyboard navigation system by tracking Tab key
 * presses. The pan animation only triggers when focus is achieved via keyboard,
 * not when clicked. The animation duration is 200ms for a smooth transition.
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
