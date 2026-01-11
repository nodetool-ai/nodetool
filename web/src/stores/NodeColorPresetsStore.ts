/**
 * NodeColorPresetsStore
 *
 * Manages named color presets for batch node coloring.
 * Presets are saved to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ColorPreset {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface NodeColorPresetsStore {
  presets: ColorPreset[];
  selectedPresetId: string | null;
  isDialogOpen: boolean;
  addPreset: (name: string, color: string) => void;
  removePreset: (id: string) => void;
  updatePreset: (id: string, name: string, color: string) => void;
  setSelectedPreset: (id: string | null) => void;
  setDialogOpen: (open: boolean) => void;
  getPresets: () => ColorPreset[];
  clearPresets: () => void;
  duplicatePreset: (id: string) => void;
}

const MAX_PRESETS = 20;

export const useNodeColorPresetsStore = create<NodeColorPresetsStore>()(
  persist(
    (set, get) => ({
      presets: [
        {
          id: "preset-input",
          name: "Input",
          color: "#3B82F6",
          createdAt: Date.now()
        },
        {
          id: "preset-output",
          name: "Output",
          color: "#10B981",
          createdAt: Date.now()
        },
        {
          id: "preset-process",
          name: "Processing",
          color: "#F59E0B",
          createdAt: Date.now()
        },
        {
          id: "preset-model",
          name: "Model",
          color: "#8B5CF6",
          createdAt: Date.now()
        }
      ],
      selectedPresetId: null,
      isDialogOpen: false,

      addPreset: (name: string, color: string) => {
        set((state) => {
          const newPreset: ColorPreset = {
            id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: name.trim(),
            color,
            createdAt: Date.now()
          };
          const updated = [newPreset, ...state.presets];
          return {
            presets: updated.slice(0, MAX_PRESETS)
          };
        });
      },

      removePreset: (id: string) => {
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id),
          selectedPresetId:
            state.selectedPresetId === id ? null : state.selectedPresetId
        }));
      },

      updatePreset: (id: string, name: string, color: string) => {
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id ? { ...p, name: name.trim(), color } : p
          )
        }));
      },

      setSelectedPreset: (id: string | null) => {
        set({ selectedPresetId: id });
      },

      setDialogOpen: (open: boolean) => {
        set({ isDialogOpen: open });
      },

      getPresets: () => {
        return get().presets;
      },

      clearPresets: () => {
        set({ presets: [], selectedPresetId: null });
      },

      duplicatePreset: (id: string) => {
        set((state) => {
          const preset = state.presets.find((p) => p.id === id);
          if (!preset) {
            return state;
          }
          const newPreset: ColorPreset = {
            ...preset,
            id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: `${preset.name} (Copy)`,
            createdAt: Date.now()
          };
          const updated = [newPreset, ...state.presets];
          return {
            presets: updated.slice(0, MAX_PRESETS)
          };
        });
      }
    }),
    {
      name: "nodetool-color-presets",
      version: 1
    }
  )
);

export default useNodeColorPresetsStore;
