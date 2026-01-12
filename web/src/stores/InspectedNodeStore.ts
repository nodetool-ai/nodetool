import { create } from "zustand";

interface InspectedNodeStore {
  inspectedNodeId: string | null;
  setInspectedNodeId: (nodeId: string | null) => void;
  toggleInspectedNode: (nodeId: string) => void;
}

export const useInspectedNodeStore = create<InspectedNodeStore>((set) => ({
  inspectedNodeId: null,
  setInspectedNodeId: (nodeId) => set({ inspectedNodeId: nodeId }),
  toggleInspectedNode: (nodeId) =>
    set((state) => ({
      inspectedNodeId: state.inspectedNodeId === nodeId ? null : nodeId
    }))
}));

export default useInspectedNodeStore;
