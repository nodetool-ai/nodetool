import { useCallback, useState } from "react";
import { Node } from "@xyflow/react";

type MenuType = {
  id: string;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  [x: string]: any;
};

export function useNodeContextMenu() {
  /* NODE CONTEXT MENU */
  const [nodeContextMenu, setNodeContextMenu] = useState<MenuType | null>(null);

  /* PANE CLICK */
  const onPaneClick = useCallback(
    () => setNodeContextMenu(null),
    [setNodeContextMenu]
  );

  /* NODE CLICK */
  const onNodeClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as Element;
      if (target.closest(".delete")) {
        return;
      }
      setNodeContextMenu(null);
    },
    [setNodeContextMenu]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const clickedElement = event.target as HTMLElement;
      if (clickedElement.classList.contains("node-header")) {
        event.preventDefault();
        setNodeContextMenu({
          id: node.id,
          top: event.clientY - 40,
          left: event.clientX - 10,
          right: event.clientX + 0,
          bottom: event.clientY + 0
        });
      }
    },
    [setNodeContextMenu]
  );
  return {
    nodeContextMenu,
    setNodeContextMenu,
    onNodeContextMenu,
    onNodeClick,
    onPaneClick
  };
}
