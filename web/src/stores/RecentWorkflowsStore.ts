/**
 * RecentWorkflowsStore
 *
 * Tracks recently accessed/edited workflows for quick access on the dashboard.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentWorkflow {
  id: string;
  name: string;
  timestamp: number;
}

interface RecentWorkflowsStore {
  recentWorkflows: RecentWorkflow[];
  addRecentWorkflow: (id: string, name: string) => void;
  getRecentWorkflows: () => RecentWorkflow[];
  clearRecentWorkflows: () => void;
  removeWorkflow: (id: string) => void;
}

const MAX_RECENT_WORKFLOWS = 10;

export const useRecentWorkflowsStore = create<RecentWorkflowsStore>()(
  persist(
    (set, get) => ({
      recentWorkflows: [],

      addRecentWorkflow: (id: string, name: string) => {
        set((state) => {
          const existingIndex = state.recentWorkflows.findIndex(
            (wf) => wf.id === id
          );

          let updated: RecentWorkflow[];

          if (existingIndex !== -1) {
            const workflow = state.recentWorkflows[existingIndex];
            updated = [
              { ...workflow, timestamp: Date.now(), name },
              ...state.recentWorkflows.slice(0, existingIndex),
              ...state.recentWorkflows.slice(existingIndex + 1)
            ];
          } else {
            updated = [
              { id, name, timestamp: Date.now() },
              ...state.recentWorkflows
            ];
          }

          return {
            recentWorkflows: updated.slice(0, MAX_RECENT_WORKFLOWS)
          };
        });
      },

      getRecentWorkflows: () => {
        return get().recentWorkflows;
      },

      clearRecentWorkflows: () => {
        set({ recentWorkflows: [] });
      },

      removeWorkflow: (id: string) => {
        set((state) => ({
          recentWorkflows: state.recentWorkflows.filter(
            (wf) => wf.id !== id
          )
        }));
      }
    }),
    {
      name: "nodetool-recent-workflows",
      version: 1
    }
  )
);

export default useRecentWorkflowsStore;
