import { create } from "zustand";
import type { NodeMetadata } from "./ApiTypes";

/**
 * Bridge store that lets components rendered *outside* the workflow editor's
 * `ReactFlowProvider` (e.g. the left-panel quick-access tiles) request node
 * creation in the active workflow. A small `<NodeCreateBridge />` lives
 * inside the provider and consumes pending requests via `useCreateNode`.
 *
 * Each request carries a `requestedAt` timestamp; the bridge ignores
 * requests older than `MAX_AGE_MS` so a click made while no editor is
 * mounted doesn't silently create a node minutes later when the user
 * switches to an editor tab.
 */
export interface PendingNodeCreateRequest {
  metadata: NodeMetadata;
  requestedAt: number;
}

interface PendingNodeCreateState {
  pending: PendingNodeCreateRequest | null;
  requestCreate: (metadata: NodeMetadata) => void;
  consume: () => NodeMetadata | null;
  clear: () => void;
}

/** Maximum age (ms) for a pending request before the bridge discards it. */
export const PENDING_NODE_CREATE_MAX_AGE_MS = 1500;

const usePendingNodeCreateStore = create<PendingNodeCreateState>((set, get) => ({
  pending: null,
  requestCreate: (metadata) =>
    set({ pending: { metadata, requestedAt: Date.now() } }),
  consume: () => {
    const req = get().pending;
    if (!req) {
      return null;
    }
    set({ pending: null });
    if (Date.now() - req.requestedAt > PENDING_NODE_CREATE_MAX_AGE_MS) {
      return null;
    }
    return req.metadata;
  },
  clear: () => set({ pending: null })
}));

export default usePendingNodeCreateStore;
