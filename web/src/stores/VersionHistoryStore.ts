/**
 * VersionHistoryStore manages workflow version history UI state.
 *
 * Responsibilities:
 * - Store UI state (selected version, compare mode, panel open state)
 * - Store edit counters and autosave timestamps (client-side tracking)
 * - Manage workflow branches (create, delete, switch, list)
 * - Track current active branch
 * - Note: Actual versions are fetched from the API via useWorkflowVersions hook
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WorkflowVersion as ApiWorkflowVersion } from "./ApiTypes";

export type SaveType = "manual" | "autosave" | "restore" | "checkpoint";

export type WorkflowVersion = ApiWorkflowVersion & { branch_id?: string };

export interface WorkflowBranch {
  id: string;
  name: string;
  workflow_id: string;
  created_at: string;
  description?: string;
  parent_branch_id?: string;
  base_version: number;
  is_active: boolean;
}

interface VersionHistoryState {
  // Currently selected version for viewing
  selectedVersionId: string | null;

  // Compare mode state
  compareVersionId: string | null;
  isCompareMode: boolean;

  // Panel state
  isHistoryPanelOpen: boolean;

  // Branch management
  branches: WorkflowBranch[];
  currentBranchId: string | null;
  isCreatingBranch: boolean;

  // Last autosave timestamp per workflow
  lastAutosaveTime: Record<string, number>;

  // Edit counter for autosave triggering
  editCountSinceLastSave: Record<string, number>;

  // Version tree view state
  viewMode: "list" | "timeline";

  // Actions
  setSelectedVersion: (versionId: string | null) => void;
  setCompareVersion: (versionId: string | null) => void;
  setHistoryPanelOpen: (open: boolean) => void;
  setCompareMode: (enabled: boolean) => void;
  setViewMode: (mode: "list" | "timeline") => void;
  incrementEditCount: (workflowId: string) => void;
  resetEditCount: (workflowId: string) => void;
  getEditCount: (workflowId: string) => number;
  updateLastAutosaveTime: (workflowId: string) => void;
  getLastAutosaveTime: (workflowId: string) => number;

  // Branch actions
  setBranches: (branches: WorkflowBranch[]) => void;
  addBranch: (branch: WorkflowBranch) => void;
  removeBranch: (branchId: string) => void;
  setCurrentBranch: (branchId: string | null) => void;
  setCreatingBranch: (creating: boolean) => void;
  clearState: () => void;
}

export const useVersionHistoryStore = create<VersionHistoryState>()(
  persist(
    (set, get) => ({
      selectedVersionId: null,
      compareVersionId: null,
      isCompareMode: false,
      isHistoryPanelOpen: false,
      branches: [],
      currentBranchId: null,
      isCreatingBranch: false,
      lastAutosaveTime: {},
      editCountSinceLastSave: {},
      viewMode: "list",

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

      setViewMode: (mode: "list" | "timeline"): void => {
        set({ viewMode: mode });
      },

      incrementEditCount: (workflowId: string): void => {
        set((state) => ({
          editCountSinceLastSave: {
            ...state.editCountSinceLastSave,
            [workflowId]: (state.editCountSinceLastSave[workflowId] ?? 0) + 1
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
        return get().editCountSinceLastSave[workflowId] ?? 0;
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

      setBranches: (branches: WorkflowBranch[]): void => {
        set({ branches });
      },

      addBranch: (branch: WorkflowBranch): void => {
        set((state) => ({
          branches: [...state.branches, branch]
        }));
      },

      removeBranch: (branchId: string): void => {
        set((state) => ({
          branches: state.branches.filter((b) => b.id !== branchId),
          currentBranchId: state.currentBranchId === branchId ? null : state.currentBranchId
        }));
      },

      setCurrentBranch: (branchId: string | null): void => {
        set({ currentBranchId: branchId });
      },

      setCreatingBranch: (creating: boolean): void => {
        set({ isCreatingBranch: creating });
      },

      clearState: (): void => {
        set({
          selectedVersionId: null,
          compareVersionId: null,
          isCompareMode: false,
          isHistoryPanelOpen: false,
          branches: [],
          currentBranchId: null,
          isCreatingBranch: false,
          viewMode: "list"
        });
      }
    }),
    {
      name: "version-history-storage",
      partialize: (state) => ({
        lastAutosaveTime: state.lastAutosaveTime,
        branches: state.branches,
        currentBranchId: state.currentBranchId
        // Don't persist UI state like panel open/compare mode
      })
    }
  )
);
