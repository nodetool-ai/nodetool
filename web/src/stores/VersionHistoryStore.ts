/**
 * VersionHistoryStore manages workflow version history UI state.
 *
 * Responsibilities:
 * - Store UI state (selected version, compare mode, panel open state)
 * - Store edit counters and autosave timestamps (client-side tracking)
 * - Manage local workflow snapshots (create, restore, delete, list)
 * - Note: Actual versions are fetched from the API via useWorkflowVersions hook
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uuidv4 } from "./uuidv4";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

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
      position?: { x: number; y: number };
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
    }>;
  };
  save_type?: SaveType;
}

export interface LocalSnapshot {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  createdAt: number;
  graph: {
    nodes: Node<NodeData>[];
    edges: Edge[];
  };
  thumbnail?: string;
}

interface VersionHistoryState {
  selectedVersionId: string | null;
  compareVersionId: string | null;
  isCompareMode: boolean;
  isHistoryPanelOpen: boolean;
  lastAutosaveTime: Record<string, number>;
  editCountSinceLastSave: Record<string, number>;
  localSnapshots: Record<string, LocalSnapshot[]>;
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
  createSnapshot: (
    workflowId: string,
    nodes: Node<NodeData>[],
    edges: Edge[],
    name: string,
    description?: string
  ) => LocalSnapshot;
  restoreSnapshot: (workflowId: string, snapshotId: string) => LocalSnapshot | null;
  deleteSnapshot: (workflowId: string, snapshotId: string) => void;
  getSnapshots: (workflowId: string) => LocalSnapshot[];
  updateSnapshot: (
    workflowId: string,
    snapshotId: string,
    updates: Partial<Pick<LocalSnapshot, "name" | "description">>
  ) => void;
  clearWorkflowSnapshots: (workflowId: string) => void;
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
      localSnapshots: {},

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

      clearState: (): void => {
        set({
          selectedVersionId: null,
          compareVersionId: null,
          isCompareMode: false,
          isHistoryPanelOpen: false
        });
      },

      createSnapshot: (
        workflowId: string,
        nodes: Node<NodeData>[],
        edges: Edge[],
        name: string,
        description?: string
      ): LocalSnapshot => {
        const snapshot: LocalSnapshot = {
          id: uuidv4(),
          workflowId,
          name,
          description,
          createdAt: Date.now(),
          graph: {
            nodes: nodes.map((n) => ({
              id: n.id,
              type: n.type,
              data: n.data,
              position: n.position,
              selected: false,
              focused: false
            })),
            edges: edges.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle,
              targetHandle: e.targetHandle
            }))
          }
        };

        set((state) => {
          const workflowSnapshots = state.localSnapshots[workflowId] || [];
          return {
            localSnapshots: {
              ...state.localSnapshots,
              [workflowId]: [snapshot, ...workflowSnapshots]
            }
          };
        });

        return snapshot;
      },

      restoreSnapshot: (workflowId: string, snapshotId: string): LocalSnapshot | null => {
        const snapshots = get().localSnapshots[workflowId] || [];
        const snapshot = snapshots.find((s) => s.id === snapshotId);
        return snapshot || null;
      },

      deleteSnapshot: (workflowId: string, snapshotId: string): void => {
        set((state) => {
          const workflowSnapshots = state.localSnapshots[workflowId] || [];
          return {
            localSnapshots: {
              ...state.localSnapshots,
              [workflowId]: workflowSnapshots.filter((s) => s.id !== snapshotId)
            }
          };
        });
      },

      getSnapshots: (workflowId: string): LocalSnapshot[] => {
        return get().localSnapshots[workflowId] || [];
      },

      updateSnapshot: (
        workflowId: string,
        snapshotId: string,
        updates: Partial<Pick<LocalSnapshot, "name" | "description">>
      ): void => {
        set((state) => {
          const workflowSnapshots = state.localSnapshots[workflowId] || [];
          return {
            localSnapshots: {
              ...state.localSnapshots,
              [workflowId]: workflowSnapshots.map((s) =>
                s.id === snapshotId ? { ...s, ...updates } : s
              )
            }
          };
        });
      },

      clearWorkflowSnapshots: (workflowId: string): void => {
        set((state) => {
          const { [workflowId]: _, ...remainingSnapshots } = state.localSnapshots;
          return {
            localSnapshots: remainingSnapshots
          };
        });
      }
    }),
    {
      name: "version-history-storage",
      partialize: (state) => ({
        lastAutosaveTime: state.lastAutosaveTime,
        localSnapshots: state.localSnapshots
        // Don't persist UI state like panel open/compare mode
      })
    }
  )
);
