/**
 * SelectedClipNodeStore
 *
 * Tracks the node currently selected within a generated clip's bound workflow.
 * Scoped to the timeline inspector — does NOT touch the global InspectedNodeStore
 * used by the workflow editor.
 *
 * Usage:
 *   const selectedId = useSelectedClipNodeStore(s => s.selectedClipNodeId);
 *   const setSelectedClipNodeId = useSelectedClipNodeStore(s => s.setSelectedClipNodeId);
 */

import { create } from "zustand";

export interface SelectedClipNodeState {
  /** The node ID selected within the current clip's bound workflow. */
  selectedClipNodeId: string | null;

  /** Select a specific node in the clip's workflow graph. */
  setSelectedClipNodeId: (id: string | null) => void;

  /**
   * Reset selection when the user changes which clip is selected.
   * Pass the clip's `selectedOutputNodeId` (or the first stale node, or null)
   * so the default selection matches the terminal output node.
   */
  resetForClip: (defaultNodeId: string | null) => void;
}

export const useSelectedClipNodeStore = create<SelectedClipNodeState>(
  (set) => ({
    selectedClipNodeId: null,

    setSelectedClipNodeId: (id) => set({ selectedClipNodeId: id }),

    resetForClip: (defaultNodeId) =>
      set({ selectedClipNodeId: defaultNodeId ?? null })
  })
);
