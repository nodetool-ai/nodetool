import React, { useCallback } from "react";
import { Node } from "@xyflow/react";
import useContextMenu from "../../stores/ContextMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import useSelect from "../nodes/useSelect";

export function useNodeEvents() {
  const { openContextMenu } = useContextMenu();
  const { close: closeSelect } = useSelect();

  const onNodesChange = useNodes((state) => state.onNodesChange);
  const setHoveredNodeId = useNodes((state) => state.setHoveredNodeId);

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

  const handleNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setHoveredNodeId(node.id);
    },
    [setHoveredNodeId]
  );

  const handleNodeMouseLeave = useCallback(
    (_event: React.MouseEvent, _node: Node) => {
      setHoveredNodeId(null);
    },
    [setHoveredNodeId]
  );

  const handleNodesChange = useCallback(
    (changes: any[]) => {
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  return {
    handleNodeContextMenu,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    handleNodesChange
  };
}
