import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface GridSettings {
  visible: boolean;
  gap: number;
  size: number;
  color: string;
  variant: "dots" | "cross";
}

export interface GridSettingsStore {
  gridSettings: GridSettings;
  isPanelOpen: boolean;
  setGridVisible: (visible: boolean) => void;
  setGridGap: (gap: number) => void;
  setGridSize: (size: number) => void;
  setGridColor: (color: string) => void;
  setGridVariant: (variant: "dots" | "cross") => void;
  setGridSettings: (settings: Partial<GridSettings>) => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  resetGridSettings: () => void;
}

export const defaultGridSettings: GridSettings = {
  visible: true,
  gap: 20,
  size: 1,
  color: "#888888",
  variant: "cross"
};

export const useGridSettingsStore = create<GridSettingsStore>()(
  persist(
    (set) => ({
      gridSettings: { ...defaultGridSettings },
      isPanelOpen: false,
      setGridVisible: (visible: boolean) =>
        set((state) => ({
          gridSettings: { ...state.gridSettings, visible }
        })),
      setGridGap: (gap: number) =>
        set((state) => ({
          gridSettings: { ...state.gridSettings, gap: Math.max(10, Math.min(100, gap)) }
        })),
      setGridSize: (size: number) =>
        set((state) => ({
          gridSettings: { ...state.gridSettings, size: Math.max(0.5, Math.min(5, size)) }
        })),
      setGridColor: (color: string) =>
        set((state) => ({
          gridSettings: { ...state.gridSettings, color: color || defaultGridSettings.color }
        })),
      setGridVariant: (variant: "dots" | "cross") =>
        set((state) => ({
          gridSettings: { ...state.gridSettings, variant }
        })),
      setGridSettings: (newSettings: Partial<GridSettings>) =>
        set((state) => ({
          gridSettings: { ...state.gridSettings, ...newSettings }
        })),
      togglePanel: () =>
        set((state) => ({ isPanelOpen: !state.isPanelOpen })),
      setPanelOpen: (open: boolean) =>
        set({ isPanelOpen: open }),
      resetGridSettings: () =>
        set({ gridSettings: { ...defaultGridSettings } })
    }),
    {
      name: "grid-settings-storage"
    }
  )
);
