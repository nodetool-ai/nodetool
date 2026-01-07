import { create } from "zustand";

interface MiniMapState {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  toggleVisible: () => void;
}

export const useMiniMapStore = create<MiniMapState>((set) => ({
  visible: true,
  setVisible: (visible: boolean) => set({ visible }),
  toggleVisible: () => set((state) => ({ visible: !state.visible }))
}));
