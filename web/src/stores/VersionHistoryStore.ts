/**
 * VersionHistoryStore manages workflow version history UI state.
 *
 * Responsibilities:
 * - Store UI state (selected version, compare mode, panel open state)
 * - Store edit counters and autosave timestamps (client-side tracking)
 * - Note: Actual versions are fetched from the API via useWorkflowVersions hook
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SaveType = "manual" | "autosave" | "restore" | "checkpoint";

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version: number;
  created_at: string;
  name?: string;
  description?: string;
  graph: {
    nodes: Array<{
      id: string;
      type: string;
      data?: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
    }>;
  };
}

interface VersionHistoryState {
  // Currently selected version for viewing
  selectedVersionId: string | null;

  // Compare mode state
  compareVersionId: string | null;
  isCompareMode: boolean;

  // Panel state
  isHistoryPanelOpen: boolean;

  // Last autosave timestamp per workflow
  lastAutosaveTime: Record<string, number>;

  // Edit counter for autosave triggering
  editCountSinceLastSave: Record<string, number>;

  // Actions
  setSelectedVersion: (versionId: string | null) => void;
  setCompareVersion: (versionId: string | null) => void;
  setHistoryPanelOpen: (open: boolean) => void;
  setCompareMode: (enabled: boolean) => void;
  incrementEditCount: (workflowId: string) => void;
  resetEditCount: (workflowId: string) => void;
  getEditCount: (workflowId: string) => number;
  updateLastAutosaveTime: (workflowId: string) => void;
  getLastAutosaveTime: (workflowId: string) => number;
  clearState: () => void;
}

export const useVersionHistoryStore = create<VersionHistoryState>()(
  persist(
    (set, get) => ({
      selectedVersionId: null,
      compareVersionId: null,
      isCompareMode: false,
      isHistoryPanelOpen: false,
      lastAutosaveTime: {},
      editCountSinceLastSave: {},

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

      clearState: (): void => {
        set({
          selectedVersionId: null,
          compareVersionId: null,
          isCompareMode: false,
          isHistoryPanelOpen: false
        });
      }
    }),
    {
      name: "version-history-storage",
      partialize: (state) => ({
        lastAutosaveTime: state.lastAutosaveTime
        // Don't persist UI state like panel open/compare mode
      })
    }
  )
);
