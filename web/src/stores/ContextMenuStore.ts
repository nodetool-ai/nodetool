/**
 * Context and hooks for managing the application's context menus.
 *
 * Two contexts: ContextMenuActionsContext (stable action refs — never triggers
 * re-renders on state changes) and ContextMenuContext (state + actions — changes
 * on every open/close). Hot-path per-node components should use
 * useContextMenuActions() to avoid cascading re-renders.
 */

import { createContext, useContext } from "react";
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

export interface ContextMenuActions {
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

export interface ContextMenuContextType
  extends ContextMenuState,
    ContextMenuActions {}

export const ContextMenuContext = createContext<
  ContextMenuContextType | undefined
>(undefined);

export const ContextMenuActionsContext = createContext<
  ContextMenuActions | undefined
>(undefined);

export function useContextMenu(): ContextMenuContextType;
export function useContextMenu<Selected>(
  selector: (state: ContextMenuContextType) => Selected,
  equalityFn?: (a: Selected, b: Selected) => boolean
): Selected;
export function useContextMenu<Selected>(
  selector?: (state: ContextMenuContextType) => Selected,
  _equalityFn?: (a: Selected, b: Selected) => boolean
) {
  const context = useContext(ContextMenuContext);
  if (context === undefined) {
    throw new Error("useContextMenu must be used within a ContextMenuProvider");
  }
  return selector ? selector(context) : context;
}

export function useContextMenuActions(): ContextMenuActions {
  const context = useContext(ContextMenuActionsContext);
  if (context === undefined) {
    throw new Error(
      "useContextMenuActions must be used within a ContextMenuProvider"
    );
  }
  return context;
}

export default useContextMenu;
