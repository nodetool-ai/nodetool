import { create } from "zustand";

export type NodePlacementSource = "quickAction" | "nodeMenu" | "unknown";

type NodePlacementState = {
  pendingNodeType: string | null;
  label: string | null;
  source: NodePlacementSource | null;
  activatePlacement: (
    nodeType: string,
    label: string,
    source?: NodePlacementSource
  ) => void;
  cancelPlacement: () => void;
};

const useNodePlacementStore = create<NodePlacementState>((set) => ({
  pendingNodeType: null,
  label: null,
  source: null,
  activatePlacement: (nodeType, label, source = "unknown") =>
    set({ pendingNodeType: nodeType, label, source }),
  cancelPlacement: () => set({ pendingNodeType: null, label: null, source: null })
}));

export default useNodePlacementStore;
