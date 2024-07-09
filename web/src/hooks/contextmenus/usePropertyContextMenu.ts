import { Properties } from "property-information/lib/util/schema";
import { useCallback, useState } from "react";
import { Node } from "reactflow";

type MenuType = {
  id: string;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  [x: string]: any;
};

export function usePropertyContextMenu() {
  /* PROPERTY CONTEXT MENU */
  const [propertyContextMenu, setPropertyContextMenu] =
    useState<MenuType | null>(null);

  /* PANE CLICK */
  const onPaneClick = useCallback(
    () => setPropertyContextMenu(null),
    [setPropertyContextMenu]
  );

  /* PROPERTY CLICK */
  const onPropertyClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as Element;
      if (target.closest(".delete")) {
        return;
      }
      setPropertyContextMenu(null);
    },
    [setPropertyContextMenu]
  );

  const onPropertyContextMenu = useCallback(
    (event: React.MouseEvent, prop: Properties) => {
      const clickedElement = event.target as HTMLElement;

      if (clickedElement.classList.contains("node-property")) {
        event.preventDefault();
        setPropertyContextMenu({
          id: "",
          top: event.clientY - 40,
          left: event.clientX - 10,
          right: event.clientX + 0,
          bottom: event.clientY + 0
        });
      }
    },
    [setPropertyContextMenu]
  );
  return {
    propertyContextMenu,
    setPropertyContextMenu,
    onPropertyContextMenu,
    onPropertyClick,
    onPaneClick
  };
}
