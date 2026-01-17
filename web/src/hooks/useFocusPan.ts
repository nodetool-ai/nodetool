import { useCallback, useRef, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";

/**
 * Custom hook that pans the viewport to center on a specific node when it receives focus.
 * 
 * Used in conjunction with keyboard navigation (Tab-based) to automatically scroll
 * the workflow editor to show the focused node. The pan occurs only when the node
 * receives focus via keyboard, not mouse clicks.
 * 
 * @param nodeId - The ID of the node to pan to when focused
 * @returns Callback function to handle focus events
 * 
 * @example
 * ```typescript
 * const handleFocus = useFocusPan('node-123');
 * 
 * // Attach to node's onFocus handler
 * <BaseNode onFocus={handleFocus} />
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
