/**
 * SelectedLayerNodeStore
 *
 * Tracks the node currently selected within a generated layer's bound
 * workflow. Scoped to the sketch inspector — does NOT touch the global
 * InspectedNodeStore used by the workflow editor. Mirrors the Timeline's
 * `SelectedClipNodeStore`.
 */

import { create } from "zustand";

export interface SelectedLayerNodeState {
  /** The node ID selected within the current layer's bound workflow. */
  selectedLayerNodeId: string | null;

  setSelectedLayerNodeId: (id: string | null) => void;

  /**
   * Reset selection when the user changes which layer is selected.
   * Pass the binding's `selectedOutputNodeId` (or null) so the default
   * matches the terminal output node.
   */
  resetForLayer: (defaultNodeId: string | null) => void;
}

export const useSelectedLayerNodeStore = create<SelectedLayerNodeState>(
  (set) => ({
    selectedLayerNodeId: null,
    setSelectedLayerNodeId: (id) => set({ selectedLayerNodeId: id }),
    resetForLayer: (defaultNodeId) =>
      set({ selectedLayerNodeId: defaultNodeId ?? null })
  })
);
