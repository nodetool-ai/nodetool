/**
 * Context and hooks for managing the application's context menus.
 * Provides functionality to open and close context menus with specific positions,
 * types, and associated metadata.
 */

import React, { createContext, useContext, useCallback, useState } from "react";
import { TypeMetadata } from "./ApiTypes";

type MenuPosition = { x: number; y: number };

export interface ContextMenuState {
  openMenuType: string | null;
  nodeId: string | null;
  menuPosition: MenuPosition | null;
  type: TypeMetadata | null;
  handleId: string | null;
  description?: string;
  isDynamicProperty?: boolean;
  payload?: unknown;
}

export interface ContextMenuContextType extends ContextMenuState {
  openContextMenu: (
    contextMenuClass: string,
    nodeId: string,
    x: number,
    y: number,
    outsideClickIgnoreClass?: string,
    type?: TypeMetadata,
    handleId?: string,
    description?: string,
    isDynamicProperty?: boolean,
    payload?: unknown
  ) => void;
  closeContextMenu: () => void;
}

export const ContextMenuContext = createContext<
  ContextMenuContextType | undefined
>(undefined);

export function useContextMenu(): ContextMenuContextType;
export function useContextMenu<Selected>(
  selector: (state: ContextMenuContextType) => Selected
): Selected;
export function useContextMenu<Selected>(
  selector?: (state: ContextMenuContextType) => Selected
) {
  const context = useContext(ContextMenuContext);
  if (context === undefined) {
    throw new Error("useContextMenu must be used within a ContextMenuProvider");
  }
  return selector ? selector(context) : context;
}

export default useContextMenu;
