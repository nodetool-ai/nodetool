import { useCallback, useState } from "react";

type PaneMenuType = {
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  [x: string]: any;
};

export function usePaneContextMenu() {
  /* PANE CONTEXT MENU */
  const [paneMenu, setPaneMenu] = useState<PaneMenuType | null>(null);

  const onPaneClick = useCallback(() => setPaneMenu(null), [setPaneMenu]);

  /* PANE RIGHT CLICK */
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setPaneMenu({
        top: event.clientY - 40,
        left: event.clientX - 10,
        right: event.clientX + 0,
        bottom: event.clientY + 0
      });
    },
    [setPaneMenu]
  );

  /* PANE LEFT CLICK */
  const onPaneLeftClick = useCallback(() => setPaneMenu(null), [setPaneMenu]);

  return {
    paneMenu,
    setPaneMenu,
    onPaneLeftClick,
    onPaneContextMenu,
    onPaneClick
  };
}
