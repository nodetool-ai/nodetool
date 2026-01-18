import { useCallback, useRef, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";

/**
 * Hook for panning the canvas to a node when it receives focus via keyboard navigation.
 * 
 * This hook listens for Tab key presses and pans the ReactFlow canvas to center
 * on the specified node when it receives focus. This provides a better user
 * experience for keyboard navigation in the node editor.
 * 
 * @param nodeId - The ID of the node to pan to when focused
 * @returns Focus event handler to attach to the node's onFocus event
 * 
 * @example
 * ```typescript
 * const handleFocus = useFocusPan(node.id);
 * 
 * <Node onFocus={handleFocus} />
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
