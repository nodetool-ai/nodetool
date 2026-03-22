/**
 * MiniMapStore manages the minimap component state.
 *
 * Features:
 * - Toggle minimap visibility
 * - Configure node color display mode (default or type-based)
 * - Toggle color legend display
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Determines how nodes are colored in the minimap.
 */
export type MiniMapColorMode = "default" | "type";

interface MiniMapState {
  /** Whether the minimap is visible */
  visible: boolean;
  /** How nodes should be colored in the minimap */
  colorMode: MiniMapColorMode;
  /** Whether to show the color legend (only applies when colorMode is 'type') */
  showLegend: boolean;

  // Actions
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
