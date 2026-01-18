import React, { useCallback } from "react";
import { Node } from "@xyflow/react";
import useContextMenu from "../../stores/ContextMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import useSelect from "../nodes/useSelect";

/**
 * Hook for handling node-related events in the workflow editor.
 * 
 * Provides event handlers for node context menus and node changes.
 * 
 * @returns Object containing event handlers:
 * - handleNodeContextMenu: Opens context menu on right-click
 * - handleNodesChange: Propagates node changes to the store
 * 
 * @example
 * ```typescript
 * const { handleNodeContextMenu, handleNodesChange } = useNodeEvents();
 * 
 * return (
 *   <ReactFlow
 *     onNodeContextMenu={handleNodeContextMenu}
 *     onNodesChange={handleNodesChange}
 *   />
 * );
 * ```
 */
export function useNodeEvents() {
  const { openContextMenu } = useContextMenu();
  const { close: closeSelect } = useSelect();

  const onNodesChange = useNodes((state) => state.onNodesChange);

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "node-context-menu",
        node.id,
        event.clientX,
        event.clientY,
        "node-header"
      );
      closeSelect();
    },
    [openContextMenu, closeSelect]
  );

  const handleNodesChange = useCallback(
    (changes: any[]) => {
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  return {
    handleNodeContextMenu,
    handleNodesChange
  };
}
