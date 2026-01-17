import { useCallback, useRef, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";

/**
 * Custom hook for handling viewport panning when nodes receive focus via keyboard navigation.
 * 
 * Integrates with the tab-based keyboard navigation system to automatically pan the
 * viewport to center on a node when it receives focus. The hook detects Tab key presses
 * and triggers viewport centering when a node is focused, providing smooth navigation
 * experience for keyboard-only users.
 * 
 * The hook tracks Tab key state using a ref to determine if focus was triggered by
 * keyboard navigation rather than mouse clicks. This prevents unwanted panning when
 * users click on nodes with the mouse.
 * 
 * @param nodeId - The ID of the node to pan to when focused
 * @returns Callback function to be attached to the node's onFocus event
 * 
 * @example
 * ```typescript
 * const handleFocus = useFocusPan(node.id);
 * 
 * return (
 *   <BaseNode
 *     onFocus={handleFocus}
 *     tabIndex={0}
 *   >
 *     ...
 *   </BaseNode>
 * );
 * ```
 * 
 * @see {@link useNodeFocus} - Main keyboard navigation hook
 * @see {@link https://github.com/nodetool-ai/nodetool/blob/main/web/src/config/shortcuts.ts | Keyboard Shortcuts}
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
