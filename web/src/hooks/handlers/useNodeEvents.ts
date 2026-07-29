import React, { useCallback } from "react";
import { Node, NodeChange } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import useContextMenu from "../../stores/ContextMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import useSelect from "../nodes/useSelect";

export function useNodeEvents(): {
  handleNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  handleNodesChange: (changes: NodeChange<Node<NodeData>>[]) => void;
} {
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
    (changes: NodeChange<Node<NodeData>>[]) => {
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  return {
    handleNodeContextMenu,
    handleNodesChange
  };
}
