import { useCallback, useState } from "react";

type MenuType = {
  id: string;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  [x: string]: any;
};

export function useOutputContextMenu() {
  /* OUTPUT CONTEXT MENU */
  const [outputContextMenu, setOutputContextMenu] = useState<MenuType | null>(
    null
  );

  /* PANE CLICK */
  const onPaneClick = useCallback(
    () => setOutputContextMenu(null),
    [setOutputContextMenu]
  );

  /* OUTPUT CLICK */
  const onOutputClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as Element;
      if (target.closest(".delete")) {
        return;
      }
      setOutputContextMenu(null);
    },
    [setOutputContextMenu]
  );

  const onOutputContextMenu = useCallback(
    (event: React.MouseEvent) => {
      const clickedElement = event.target as HTMLElement;

      if (clickedElement.classList.contains("node-output")) {
        event.preventDefault();
        setOutputContextMenu({
          id: "",
          top: event.clientY - 40,
          left: event.clientX - 10,
          right: event.clientX + 0,
          bottom: event.clientY + 0
        });
      }
    },
    [setOutputContextMenu]
  );
  return {
    outputContextMenu,
    setOutputContextMenu,
    onOutputContextMenu,
    onOutputClick,
    onPaneClick
  };
}
