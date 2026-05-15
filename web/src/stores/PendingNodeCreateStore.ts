import { create } from "zustand";
import type { NodeMetadata } from "./ApiTypes";

/**
 * Bridge store that lets components rendered *outside* the workflow editor's
 * `ReactFlowProvider` (e.g. the left-panel quick-access tiles) request node
 * creation in the active workflow. A small `<NodeCreateBridge />` lives
 * inside the provider and consumes pending requests via `useCreateNode`.
 */
interface PendingNodeCreateState {
  pending: NodeMetadata | null;
  requestCreate: (metadata: NodeMetadata) => void;
  consume: () => NodeMetadata | null;
}

const usePendingNodeCreateStore = create<PendingNodeCreateState>((set, get) => ({
  pending: null,
  requestCreate: (metadata) => set({ pending: metadata }),
  consume: () => {
    const m = get().pending;
    if (m) {
      set({ pending: null });
    }
    return m;
  }
}));

export default usePendingNodeCreateStore;
