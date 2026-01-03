import { useCallback, MouseEvent as ReactMouseEvent } from "react";
import { Node } from "@xyflow/react";
import useContextMenu from "../../stores/ContextMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import useSelect from "../nodes/useSelect";

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
        "",
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
