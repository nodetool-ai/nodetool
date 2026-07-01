import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

/**
 * Minimal identity for a sidebar document (timeline or sketch) that the shared
 * context menu operates on.
 */
export interface SidebarDocumentItem {
  id: string;
  name: string;
}

interface SidebarDocumentActionsState {
  onRename: ((item: SidebarDocumentItem) => void) | null;
  onDuplicate: ((item: SidebarDocumentItem) => void) | null;
  onDelete: ((item: SidebarDocumentItem) => void) | null;
  setActions: (actions: {
    onRename?: (item: SidebarDocumentItem) => void;
    onDuplicate?: (item: SidebarDocumentItem) => void;
    onDelete?: (item: SidebarDocumentItem) => void;
  }) => void;
  clearActions: () => void;
}

/**
 * Holds the action handlers for the currently mounted sidebar document list
 * (timelines or sketches). Only one such list is mounted at a time, so a single
 * shared store is enough — it mirrors WorkflowActionsStore. The globally
 * rendered SidebarDocumentContextMenu reads these handlers; the list panel sets
 * them on mount and clears them on unmount.
 */
export const useSidebarDocumentActionsStore =
  create<SidebarDocumentActionsState>((set) => ({
    onRename: null,
    onDuplicate: null,
    onDelete: null,
    setActions: (actions) =>
      set({
        onRename: actions.onRename ?? null,
        onDuplicate: actions.onDuplicate ?? null,
        onDelete: actions.onDelete ?? null
      }),
    clearActions: () =>
      set({ onRename: null, onDuplicate: null, onDelete: null })
  }));

export const useSidebarDocumentActions = () =>
  useSidebarDocumentActionsStore(
    useShallow((state) => ({
      onRename: state.onRename,
      onDuplicate: state.onDuplicate,
      onDelete: state.onDelete
    }))
  );
