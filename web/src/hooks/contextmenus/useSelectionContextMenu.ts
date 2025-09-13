import { useCallback, useState } from "react";

type SelectionMenuType = {
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  [x: string]: any;
};

export function useSelectionContextMenu() {
  /* SELECTION CONTEXT MENU */
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenuType | null>(
    null
  );

  const onSelectionClick = useCallback(
    () => setSelectionMenu(null),
    [setSelectionMenu]
  );

  /* RIGHT CLICK */
  const onSelectionContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setSelectionMenu({
        top: event.clientY - 40,
        left: event.clientX - 10,
        right: event.clientX + 0,
        bottom: event.clientY + 0
      });
    },
    [setSelectionMenu]
  );

  /* LEFT CLICK */
  const onSelectionLeftClick = useCallback(
    () => setSelectionMenu(null),
    [setSelectionMenu]
  );

  return {
    selectionMenu,
    setSelectionMenu,
    onSelectionLeftClick,
    onSelectionContextMenu,
    onSelectionClick
  };
}
