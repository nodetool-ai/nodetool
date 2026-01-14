/**
 * NodePresetsStore
 *
 * Tracks saved node configuration presets for quick access.
 * Persists to localStorage for cross-session availability.
 *
 * A preset stores:
 * - The node type (e.g., "nodetool.llm.Chat")
 * - A user-friendly name
 * - The saved property values
 * - Optional description
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NodePreset {
  id: string;
  nodeType: string;
  name: string;
  description?: string;
  properties: Record<string, unknown>;
  icon?: string;
  createdAt: number;
  usageCount: number;
}

interface NodePresetsStore {
  presets: NodePreset[];
  addPreset: (preset: Omit<NodePreset, "id" | "createdAt" | "usageCount">) => string;
  removePreset: (id: string) => void;
  updatePreset: (id: string, updates: Partial<Omit<NodePreset, "id" | "createdAt">>) => void;
  getPresetsForNodeType: (nodeType: string) => NodePreset[];
  getPreset: (id: string) => NodePreset | undefined;
  incrementUsage: (id: string) => void;
  clearPresets: () => void;
  reorderPresets: (fromIndex: number, toIndex: number) => void;
  importPresets: (presets: NodePreset[]) => void;
  exportPresets: () => NodePreset[];
}

const MAX_PRESETS = 20;

export const useNodePresetsStore = create<NodePresetsStore>()(
  persist(
    (set, get) => ({
      presets: [],

      addPreset: (presetData) => {
        const id = crypto.randomUUID
          ? crypto.randomUUID()
          : `preset_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

        const newPreset: NodePreset = {
          ...presetData,
          id,
          createdAt: Date.now(),
          usageCount: 0
        };

        set((state) => {
          const updated = [newPreset, ...state.presets];
          return {
            presets: updated.slice(0, MAX_PRESETS)
          };
        });

        return id;
      },

      removePreset: (id: string) => {
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id)
        }));
      },

      updatePreset: (id: string, updates) => {
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          )
        }));
      },

      getPresetsForNodeType: (nodeType: string) => {
        return get().presets.filter((p) => p.nodeType === nodeType);
      },

      getPreset: (id: string) => {
        return get().presets.find((p) => p.id === id);
      },

      incrementUsage: (id: string) => {
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p
          )
        }));
      },

      clearPresets: () => {
        set({ presets: [] });
      },

      reorderPresets: (fromIndex: number, toIndex: number) => {
        set((state) => {
          const updated = [...state.presets];
          if (
            fromIndex >= 0 &&
            fromIndex < updated.length &&
            toIndex >= 0 &&
            toIndex < updated.length
          ) {
            const [removed] = updated.splice(fromIndex, 1);
            updated.splice(toIndex, 0, removed);
          }
          return { presets: updated };
        });
      },

      importPresets: (importedPresets) => {
        set((state) => {
          const existingIds = new Set(state.presets.map((p) => p.id));
          const newPresets = importedPresets.filter(
            (p) => !existingIds.has(p.id)
          );
          const updated = [...newPresets, ...state.presets];
          return {
            presets: updated.slice(0, MAX_PRESETS)
          };
        });
      },

      exportPresets: () => {
        return get().presets;
      }
    }),
    {
      name: "nodetool-node-presets",
      version: 1
    }
  )
);

export default useNodePresetsStore;
