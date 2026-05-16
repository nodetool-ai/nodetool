/**
 * livePreviewStore — client-side overlay store for in-progress image previews.
 *
 * Bespoke node bodies (e.g. ResizeBody) can write a transient preview here
 * while the user is dragging a control. Consumers read via `getPreview(nodeId)`
 * and the shape mirrors `ResultsStore.getResult` so a body can swap a real
 * result for an overlay seamlessly.
 *
 * Lives separately from `ResultsStore` to avoid polluting server-emitted state:
 * previews are ephemeral and disappear on workflow rerun.
 */

import { create } from "zustand";

export type LivePreviewValue = unknown;

interface LivePreviewState {
  previews: Record<string, LivePreviewValue>;
  getPreview: (nodeId: string) => LivePreviewValue | undefined;
  setPreview: (nodeId: string, value: LivePreviewValue) => void;
  clearPreview: (nodeId: string) => void;
  clearAll: () => void;
}

export const useLivePreviewStore = create<LivePreviewState>((set, get) => ({
  previews: {},
  getPreview: (nodeId: string) => get().previews[nodeId],
  setPreview: (nodeId: string, value: LivePreviewValue) => {
    set((state) => ({
      previews: { ...state.previews, [nodeId]: value }
    }));
  },
  clearPreview: (nodeId: string) => {
    set((state) => {
      if (!(nodeId in state.previews)) return state;
      const { [nodeId]: _removed, ...rest } = state.previews;
      return { previews: rest };
    });
  },
  clearAll: () => set({ previews: {} })
}));

export default useLivePreviewStore;
