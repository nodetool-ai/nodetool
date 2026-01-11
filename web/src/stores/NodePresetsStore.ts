/**
 * NodePresetsStore
 *
 * Manages node configuration presets that allow users to save and quickly apply
 * common node property configurations. Presets persist to localStorage.
 *
 * Features:
 * - Save current node properties as a named preset
 * - Apply presets to nodes of the same type
 * - Delete and rename presets
 * - Organize presets by node type
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NodePresetProperty {
  name: string;
  value: unknown;
}

export interface NodePreset {
  id: string;
  name: string;
  nodeType: string;
  properties: NodePresetProperty[];
  description?: string;
  createdAt: number;
  updatedAt: number;
}

interface _PresetPropertyInput {
  name: string;
  type: string;
  label?: string;
  defaultValue?: unknown;
}

export interface NodePresetsStore {
  presets: NodePreset[];
  addPreset: (preset: Omit<NodePreset, "id" | "createdAt" | "updatedAt">) => string;
  updatePreset: (id: string, updates: Partial<Omit<NodePreset, "id" | "nodeType" | "createdAt">>) => void;
  deletePreset: (id: string) => void;
  getPresetsForNodeType: (nodeType: string) => NodePreset[];
  getPresetById: (id: string) => NodePreset | undefined;
  applyPreset: (nodeType: string, presetId: string) => NodePreset | undefined;
  duplicatePreset: (id: string, newName: string) => string;
  clearAllPresets: () => void;
  importPresets: (presets: NodePreset[]) => void;
  exportPresets: () => NodePreset[];
}

const MAX_PRESETS_PER_NODE_TYPE = 20;
const MAX_TOTAL_PRESETS = 100;

export const useNodePresetsStore = create<NodePresetsStore>()(
  persist(
    (set, get) => ({
      presets: [],

      addPreset: (presetData) => {
        const id = `preset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();

        set((state) => {
          const newPreset: NodePreset = {
            ...presetData,
            id,
            createdAt: now,
            updatedAt: now
          };

          const existingPresetsForType = state.presets.filter(
            (p) => p.nodeType === presetData.nodeType
          );

          if (existingPresetsForType.length >= MAX_PRESETS_PER_NODE_TYPE) {
            const oldestPresets = [...state.presets]
              .filter((p) => p.nodeType === presetData.nodeType)
              .sort((a, b) => a.createdAt - b.createdAt)
              .slice(0, existingPresetsForType.length - MAX_PRESETS_PER_NODE_TYPE + 1);

            const idsToRemove = new Set(oldestPresets.map((p) => p.id));
            return {
              presets: [
                newPreset,
                ...state.presets.filter((p) => !idsToRemove.has(p.id))
              ].slice(0, MAX_TOTAL_PRESETS)
            };
          }

          return {
            presets: [newPreset, ...state.presets].slice(0, MAX_TOTAL_PRESETS)
          };
        });

        return id;
      },

      updatePreset: (id, updates) => {
        set((state) => ({
          presets: state.presets.map((preset) =>
            preset.id === id
              ? { ...preset, ...updates, updatedAt: Date.now() }
              : preset
          )
        }));
      },

      deletePreset: (id) => {
        set((state) => ({
          presets: state.presets.filter((preset) => preset.id !== id)
        }));
      },

      getPresetsForNodeType: (nodeType) => {
        return get()
          .presets.filter((preset) => preset.nodeType === nodeType)
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },

      getPresetById: (id) => {
        return get().presets.find((preset) => preset.id === id);
      },

      applyPreset: (nodeType, presetId) => {
        const preset = get().presets.find(
          (p) => p.id === presetId && p.nodeType === nodeType
        );
        return preset;
      },

      duplicatePreset: (id, newName) => {
        const existingPreset = get().presets.find((p) => p.id === id);
        if (!existingPreset) {
          throw new Error(`Preset with id ${id} not found`);
        }

        const newId = get().addPreset({
          name: newName,
          nodeType: existingPreset.nodeType,
          properties: [...existingPreset.properties],
          description: existingPreset.description
        });

        return newId;
      },

      clearAllPresets: () => {
        set({ presets: [] });
      },

      importPresets: (importedPresets) => {
        set((state) => {
          const existingIds = new Set(state.presets.map((p) => p.id));
          const newPresets = importedPresets.filter((p) => !existingIds.has(p.id));
          return {
            presets: [...newPresets, ...state.presets].slice(0, MAX_TOTAL_PRESETS)
          };
        });
      },

      exportPresets: () => {
        return [...get().presets];
      }
    }),
    {
      name: "nodetool-node-presets",
      version: 1
    }
  )
);

export default useNodePresetsStore;
