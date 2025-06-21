/**
 * ContextMenuProvider manages the state and behavior of context menus throughout the application.
 * It provides functionality to open and close context menus, handle click-outside events,
 * and maintain menu state including position, associated node, and metadata.
 */

import React, { useCallback, useState, useRef } from "react";
import {
  ContextMenuContext,
  ContextMenuState
} from "../stores/ContextMenuStore";
import { TypeMetadata } from "../stores/ApiTypes";

export function ContextMenuProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const currentClickOutsideHandlerRef = useRef<
    ((event: MouseEvent) => void) | null
  >(null);
  const [state, setState] = useState<ContextMenuState>({
    openMenuType: null,
    nodeId: null,
    menuPosition: null,
    type: null,
    handleId: null,
    description: undefined,
    isDynamicProperty: undefined
  });

  const closeContextMenu = useCallback(() => {
    if (currentClickOutsideHandlerRef.current) {
      document.removeEventListener(
        "mouseup",
        currentClickOutsideHandlerRef.current
      );
      currentClickOutsideHandlerRef.current = null;
    }
    setTimeout(() => {
      setState({
        openMenuType: null,
        nodeId: null,
        menuPosition: null,
        type: null,
        handleId: null,
        description: undefined,
        isDynamicProperty: undefined
      });
    }, 50);
  }, []);

  const clickOutsideHandler = useCallback(
    (className: string) => (event: MouseEvent) => {
      let element = event.target as HTMLElement;
      let shouldCloseMenu = true;
      while (element && element.parentElement) {
        if (element.classList.contains(className)) {
          shouldCloseMenu = false;
          break;
        }
        element = element.parentElement;
      }

      if (shouldCloseMenu) {
        closeContextMenu();
      }
    },
    [closeContextMenu]
  );

  const openContextMenu = useCallback(
    (
      contextMenuClass: string,
      nodeId: string,
      x: number,
      y: number,
      outsideClickIgnoreClass?: string,
      type?: TypeMetadata,
      handleId?: string,
      description?: string,
      isDynamicProperty?: boolean
    ) => {
      if (currentClickOutsideHandlerRef.current) {
        document.removeEventListener(
          "mouseup",
          currentClickOutsideHandlerRef.current
        );
      }

      let shouldOpenMenu = true;
      if (outsideClickIgnoreClass) {
        const element = document.elementFromPoint(x, y) as HTMLElement;
        const isClickInsideBoundary =
          element.closest(`.${outsideClickIgnoreClass}`) !== null;
        shouldOpenMenu = isClickInsideBoundary;
      }

      if (shouldOpenMenu) {
        setState({
          openMenuType: contextMenuClass,
          nodeId: nodeId,
          menuPosition: { x, y },
          type: type ?? null,
          handleId: handleId ?? null,
          description: description,
          isDynamicProperty: isDynamicProperty
        });

        setTimeout(() => {
          currentClickOutsideHandlerRef.current = clickOutsideHandler(
            outsideClickIgnoreClass ? outsideClickIgnoreClass : "body"
          );
          document.addEventListener(
            "mouseup",
            currentClickOutsideHandlerRef.current
          );
        }, 500);
      }
    },
    [clickOutsideHandler]
  );
  return (
    <ContextMenuContext.Provider
      value={{
        ...state,
        openContextMenu,
        closeContextMenu
      }}
    >
      {children}
    </ContextMenuContext.Provider>
  );
}
