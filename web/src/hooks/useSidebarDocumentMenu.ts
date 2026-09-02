import { useCallback, useEffect } from "react";
import type { MouseEvent } from "react";

import useContextMenuStore from "../stores/ContextMenuStore";
import {
  useSidebarDocumentActionsStore,
  type SidebarDocumentItem
} from "../stores/SidebarDocumentActionsStore";

export type SidebarDocumentContextMenuHandler = (
  event: MouseEvent<HTMLButtonElement>,
  id: string,
  name: string
) => void;

export interface SidebarDocumentMenuHandlers {
  onRename: (item: SidebarDocumentItem) => void;
  onDuplicate: (item: SidebarDocumentItem) => void | Promise<void>;
  onDelete: (item: SidebarDocumentItem) => void;
  /**
   * Marks a row the menu may only duplicate. Called with the row's id when the
   * menu opens; must be stable, like the three handlers.
   */
  isReadOnly?: (id: string) => boolean;
}

/**
 * Publishes a document list's actions for the globally rendered
 * SidebarDocumentContextMenu and returns the handler that opens it. The three
 * callbacks must be stable — an unmemoized one re-publishes every render.
 */
export const useSidebarDocumentMenu = ({
  onRename,
  onDuplicate,
  onDelete,
  isReadOnly
}: SidebarDocumentMenuHandlers): SidebarDocumentContextMenuHandler => {
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const setActions = useSidebarDocumentActionsStore((state) => state.setActions);
  const clearActions = useSidebarDocumentActionsStore(
    (state) => state.clearActions
  );

  useEffect(() => {
    setActions({
      onRename,
      onDuplicate: (item) => void onDuplicate(item),
      onDelete
    });
    return () => clearActions();
  }, [setActions, clearActions, onRename, onDuplicate, onDelete]);

  return useCallback(
    (event, id, name) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "sidebar-document-context-menu",
        id,
        event.clientX,
        event.clientY,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { id, name, readOnly: isReadOnly?.(id) === true }
      );
    },
    [openContextMenu, isReadOnly]
  );
};
