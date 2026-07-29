import { create } from "zustand";
import { persist } from "zustand/middleware";

type MiniMapColorMode = "default" | "type";

interface MiniMapState {
  visible: boolean;
  colorMode: MiniMapColorMode;
  /** Only applies when colorMode is 'type'. */
  showLegend: boolean;

  setVisible: (visible: boolean) => void;
  toggleVisible: () => void;
  setColorMode: (mode: MiniMapColorMode) => void;
  toggleColorMode: () => void;
  setShowLegend: (show: boolean) => void;
  toggleLegend: () => void;
}

export const useMiniMapStore = create<MiniMapState>()(
  persist(
    (set) => ({
      visible: false,
      colorMode: "default",
      showLegend: true,

      setVisible: (visible: boolean) => set({ visible }),
      toggleVisible: () => set((state) => ({ visible: !state.visible })),

      setColorMode: (mode: MiniMapColorMode) => set({ colorMode: mode }),
      toggleColorMode: () =>
        set((state) => ({
          colorMode: state.colorMode === "default" ? "type" : "default"
        })),

      setShowLegend: (show: boolean) => set({ showLegend: show }),
      toggleLegend: () => set((state) => ({ showLegend: !state.showLegend }))
    }),
    {
      name: "minimap-storage",
      partialize: (state) => ({
        visible: state.visible,
        colorMode: state.colorMode,
        showLegend: state.showLegend
      })
    }
  )
);
