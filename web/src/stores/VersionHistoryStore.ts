/**
 * VersionHistoryStore manages workflow version history.
 *
 * Responsibilities:
 * - Store and manage workflow versions in localStorage
 * - Provide version CRUD operations
 * - Support version comparison and restoration
 * - Handle automatic pruning of old versions
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Graph } from "./ApiTypes";

export type SaveType = "manual" | "autosave" | "restore" | "checkpoint";

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version_number: number;
  created_at: string;
  save_type: SaveType;
  description?: string;
  graph_snapshot: Graph;
  size_bytes: number;
  is_pinned?: boolean;
}

interface VersionHistoryState {
  // Map of workflow_id -> versions array
  versions: Record<string, WorkflowVersion[]>;

  // Currently selected version for comparison
  selectedVersionId: string | null;
  compareVersionId: string | null;

  // UI state
  isHistoryPanelOpen: boolean;
  isCompareMode: boolean;

  // Last autosave timestamp per workflow
  lastAutosaveTime: Record<string, number>;

  // Edit counter for autosave triggering
  editCountSinceLastSave: Record<string, number>;

  // Actions
  saveVersion: (
    workflowId: string,
    graph: Graph,
    saveType: SaveType,
    description?: string
  ) => WorkflowVersion;
  getVersions: (workflowId: string) => WorkflowVersion[];
  getVersion: (versionId: string) => WorkflowVersion | undefined;
  deleteVersion: (versionId: string) => void;
  pinVersion: (versionId: string, pinned: boolean) => void;
  setSelectedVersion: (versionId: string | null) => void;
  setCompareVersion: (versionId: string | null) => void;
  setHistoryPanelOpen: (open: boolean) => void;
  setCompareMode: (enabled: boolean) => void;
  incrementEditCount: (workflowId: string) => void;
  resetEditCount: (workflowId: string) => void;
  getEditCount: (workflowId: string) => number;
  updateLastAutosaveTime: (workflowId: string) => void;
  getLastAutosaveTime: (workflowId: string) => number;
  pruneOldVersions: (
    workflowId: string,
    maxVersions: number,
    keepManualDays: number,
    keepAutosaveDays: number
  ) => void;
  clearVersions: (workflowId: string) => void;
}

// Helper to calculate approximate size of graph in bytes
const calculateGraphSize = (graph: Graph): number => {
  return new Blob([JSON.stringify(graph)]).size;
};

// Helper to generate unique version ID
const generateVersionId = (): string => {
  return `v_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const useVersionHistoryStore = create<VersionHistoryState>()(
  persist(
    (set, get) => ({
      versions: {},
      selectedVersionId: null,
      compareVersionId: null,
      isHistoryPanelOpen: false,
      isCompareMode: false,
      lastAutosaveTime: {},
      editCountSinceLastSave: {},

      saveVersion: (
        workflowId: string,
        graph: Graph,
        saveType: SaveType,
        description?: string
      ): WorkflowVersion => {
        const state = get();
        const existingVersions = state.versions[workflowId] || [];
        const nextVersionNumber =
          existingVersions.length > 0
            ? Math.max(...existingVersions.map((v) => v.version_number)) + 1
            : 1;

        const newVersion: WorkflowVersion = {
          id: generateVersionId(),
          workflow_id: workflowId,
          version_number: nextVersionNumber,
          created_at: new Date().toISOString(),
          save_type: saveType,
          description,
          graph_snapshot: JSON.parse(JSON.stringify(graph)), // Deep copy
          size_bytes: calculateGraphSize(graph),
          is_pinned: false
        };

        set((state) => ({
          versions: {
            ...state.versions,
            [workflowId]: [...(state.versions[workflowId] || []), newVersion]
          },
          editCountSinceLastSave: {
            ...state.editCountSinceLastSave,
            [workflowId]: 0
          }
        }));

        // Update last autosave time if this is an autosave
        if (saveType === "autosave") {
          get().updateLastAutosaveTime(workflowId);
        }

        return newVersion;
      },

      getVersions: (workflowId: string): WorkflowVersion[] => {
        const state = get();
        return (state.versions[workflowId] || []).sort(
          (a, b) => b.version_number - a.version_number
        );
      },

      getVersion: (versionId: string): WorkflowVersion | undefined => {
        const state = get();
        for (const versions of Object.values(state.versions)) {
          const found = versions.find((v) => v.id === versionId);
          if (found) {
            return found;
          }
        }
        return undefined;
      },

      deleteVersion: (versionId: string): void => {
        set((state) => {
          const newVersions = { ...state.versions };
          for (const workflowId in newVersions) {
            newVersions[workflowId] = newVersions[workflowId].filter(
              (v) => v.id !== versionId
            );
          }
          return { versions: newVersions };
        });
      },

      pinVersion: (versionId: string, pinned: boolean): void => {
        set((state) => {
          const newVersions = { ...state.versions };
          for (const workflowId in newVersions) {
            newVersions[workflowId] = newVersions[workflowId].map((v) =>
              v.id === versionId ? { ...v, is_pinned: pinned } : v
            );
          }
          return { versions: newVersions };
        });
      },

      setSelectedVersion: (versionId: string | null): void => {
        set({ selectedVersionId: versionId });
      },

      setCompareVersion: (versionId: string | null): void => {
        set({ compareVersionId: versionId });
      },

      setHistoryPanelOpen: (open: boolean): void => {
        set({ isHistoryPanelOpen: open });
      },

      setCompareMode: (enabled: boolean): void => {
        set({ isCompareMode: enabled });
        if (!enabled) {
          set({ compareVersionId: null });
        }
      },

      incrementEditCount: (workflowId: string): void => {
        set((state) => ({
          editCountSinceLastSave: {
            ...state.editCountSinceLastSave,
            [workflowId]: (state.editCountSinceLastSave[workflowId] || 0) + 1
          }
        }));
      },

      resetEditCount: (workflowId: string): void => {
        set((state) => ({
          editCountSinceLastSave: {
            ...state.editCountSinceLastSave,
            [workflowId]: 0
          }
        }));
      },

      getEditCount: (workflowId: string): number => {
        return get().editCountSinceLastSave[workflowId] || 0;
      },

      updateLastAutosaveTime: (workflowId: string): void => {
        set((state) => ({
          lastAutosaveTime: {
            ...state.lastAutosaveTime,
            [workflowId]: Date.now()
          }
        }));
      },

      getLastAutosaveTime: (workflowId: string): number => {
        return get().lastAutosaveTime[workflowId] || 0;
      },

      pruneOldVersions: (
        workflowId: string,
        maxVersions: number,
        keepManualDays: number,
        keepAutosaveDays: number
      ): void => {
        set((state) => {
          const versions = state.versions[workflowId] || [];
          const now = Date.now();
          const manualCutoff = now - keepManualDays * 24 * 60 * 60 * 1000;
          const autosaveCutoff = now - keepAutosaveDays * 24 * 60 * 60 * 1000;

          // Filter based on age and type, always keep pinned versions
          let filteredVersions = versions.filter((v) => {
            if (v.is_pinned) {
              return true;
            }

            const createdAt = new Date(v.created_at).getTime();

            if (v.save_type === "autosave") {
              return createdAt > autosaveCutoff;
            } else {
              return createdAt > manualCutoff;
            }
          });

          // If still over max, keep the most recent ones (but always keep pinned)
          if (filteredVersions.length > maxVersions) {
            const pinnedVersions = filteredVersions.filter((v) => v.is_pinned);
            const unpinnedVersions = filteredVersions
              .filter((v) => !v.is_pinned)
              .sort((a, b) => b.version_number - a.version_number)
              .slice(0, maxVersions - pinnedVersions.length);

            filteredVersions = [...pinnedVersions, ...unpinnedVersions];
          }

          return {
            versions: {
              ...state.versions,
              [workflowId]: filteredVersions
            }
          };
        });
      },

      clearVersions: (workflowId: string): void => {
        set((state) => {
          const newVersions = { ...state.versions };
          delete newVersions[workflowId];
          return { versions: newVersions };
        });
      }
    }),
    {
      name: "version-history-storage",
      partialize: (state) => ({
        versions: state.versions,
        lastAutosaveTime: state.lastAutosaveTime
        // Don't persist UI state like panel open/compare mode
      })
    }
  )
);
