import { create } from "zustand";
import { MissingModelNode } from "../utils/findMissingModelNodes";

const keyFor = (nodeId: string, propertyName: string) =>
  `${nodeId}:${propertyName}`;

/**
 * Tracks which model fields still need a model picked, so the inspector can
 * show an inline call-out next to each one (instead of a blocking dialog).
 * Populated when a run is blocked for missing models; a key is removed once
 * its model is set or the user dismisses the call-out.
 */
interface ModelCalloutState {
  keys: Set<string>;
  has: (nodeId: string, propertyName: string) => boolean;
  show: (targets: Pick<MissingModelNode, "nodeId" | "propertyName">[]) => void;
  resolve: (nodeId: string, propertyName: string) => void;
  dismissAll: () => void;
}

export const useModelCalloutStore = create<ModelCalloutState>((set, get) => ({
  keys: new Set<string>(),
  has: (nodeId, propertyName) => get().keys.has(keyFor(nodeId, propertyName)),
  show: (targets) =>
    set({
      keys: new Set(targets.map((t) => keyFor(t.nodeId, t.propertyName)))
    }),
  resolve: (nodeId, propertyName) => {
    const key = keyFor(nodeId, propertyName);
    if (!get().keys.has(key)) return;
    const next = new Set(get().keys);
    next.delete(key);
    set({ keys: next });
  },
  dismissAll: () => set({ keys: new Set<string>() })
}));

export default useModelCalloutStore;
