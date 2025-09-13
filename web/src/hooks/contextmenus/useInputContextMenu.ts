import { useCallback, useState } from "react";

type MenuType = {
  id: string;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  [x: string]: any;
};

export function useInputContextMenu() {
  /* INPUT CONTEXT MENU */
  const [inputContextMenu, setInputContextMenu] = useState<MenuType | null>(
    null
  );

  /* PANE CLICK */
  const onPaneClick = useCallback(
    () => setInputContextMenu(null),
    [setInputContextMenu]
  );

  /* INPUT CLICK */
  const onInputClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as Element;
      if (target.closest(".delete")) {
        return;
      }
      setInputContextMenu(null);
    },
    [setInputContextMenu]
  );

  const onInputContextMenu = useCallback(
    (event: React.MouseEvent) => {
      const clickedElement = event.target as HTMLElement;

      if (clickedElement.classList.contains("node-input")) {
        event.preventDefault();
        setInputContextMenu({
          id: "",
          top: event.clientY - 40,
          left: event.clientX - 10,
          right: event.clientX + 0,
          bottom: event.clientY + 0
        });
      }
    },
    [setInputContextMenu]
  );
  return {
    inputContextMenu,
    setInputContextMenu,
    onInputContextMenu,
    onInputClick,
    onPaneClick
  };
}
