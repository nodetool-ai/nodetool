import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BackgroundVariant } from "@xyflow/react";

export type GridPattern = "dots" | "lines" | "cross" | "none";

export interface GridSettings {
  pattern: GridPattern;
  gap: number;
  size: number;
  color: string;
  visible: boolean;
}

interface GridSettingsStore extends GridSettings {
  setPattern: (pattern: GridPattern) => void;
  setGap: (gap: number) => void;
  setSize: (size: number) => void;
  setColor: (color: string) => void;
  setVisible: (visible: boolean) => void;
  toggleVisibility: () => void;
  cyclePattern: () => void;
  resetToDefaults: () => void;
}

const defaultSettings: GridSettings = {
  pattern: "dots",
  gap: 100,
  size: 8,
  color: "#3e4c5e",
  visible: true
};

const patternOrder: GridPattern[] = ["dots", "lines", "cross", "none"];

export const useGridSettingsStore = create<GridSettingsStore>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      setPattern: (pattern: GridPattern) => {
        set({ pattern });
      },

      setGap: (gap: number) => {
        set({ gap: Math.max(10, Math.min(500, gap)) });
      },

      setSize: (size: number) => {
        set({ size: Math.max(1, Math.min(50, size)) });
      },

      setColor: (color: string) => {
        set({ color });
      },

      setVisible: (visible: boolean) => {
        set({ visible });
      },

      toggleVisibility: () => {
        set((state) => ({ visible: !state.visible }));
      },

      cyclePattern: () => {
        const currentPattern = get().pattern;
        const currentIndex = patternOrder.indexOf(currentPattern);
        const nextIndex = (currentIndex + 1) % patternOrder.length;
        set({ pattern: patternOrder[nextIndex] });
      },

      resetToDefaults: () => {
        set({ ...defaultSettings });
      }
    }),
    {
      name: "grid-settings",
      partialize: (state) => ({
        pattern: state.pattern,
        gap: state.gap,
        size: state.size,
        color: state.color,
        visible: state.visible
      })
    }
  )
);

export function getBackgroundVariant(pattern: GridPattern): BackgroundVariant | undefined {
  if (pattern === "none") {
    return undefined;
  }
  switch (pattern) {
    case "dots":
      return BackgroundVariant.Dots;
    case "lines":
      return BackgroundVariant.Lines;
    case "cross":
      return BackgroundVariant.Cross;
    default:
      return BackgroundVariant.Dots;
  }
}
