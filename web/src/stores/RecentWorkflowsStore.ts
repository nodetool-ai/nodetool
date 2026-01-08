/**
 * RecentWorkflowsStore
 *
 * Tracks recently accessed workflows for quick access.
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
  removeRecentWorkflow: (id: string) => void;
  clearRecentWorkflows: () => void;
  getRecentWorkflows: () => RecentWorkflow[];
  isRecentWorkflow: (id: string) => boolean;
  MAX_RECENT_WORKFLOWS: number;
}

const DEFAULT_MAX_RECENT = 10;

export const useRecentWorkflowsStore = create<RecentWorkflowsStore>()(
  persist(
    (set, get) => ({
      recentWorkflows: [],

      addRecentWorkflow: (id: string, name: string) => {
        set((state) => {
          const filtered = state.recentWorkflows.filter(
            (w) => w.id !== id
          );
          const updated = [
            { id, name, timestamp: Date.now() },
            ...filtered
          ];
          return {
            recentWorkflows: updated.slice(0, get().MAX_RECENT_WORKFLOWS)
          };
        });
      },

      removeRecentWorkflow: (id: string) => {
        set((state) => ({
          recentWorkflows: state.recentWorkflows.filter((w) => w.id !== id)
        }));
      },

      clearRecentWorkflows: () => {
        set({ recentWorkflows: [] });
      },

      getRecentWorkflows: () => {
        return get().recentWorkflows;
      },

      isRecentWorkflow: (id: string) => {
        return get().recentWorkflows.some((w) => w.id === id);
      },

      MAX_RECENT_WORKFLOWS: DEFAULT_MAX_RECENT
    }),
    {
      name: "nodetool-recent-workflows",
      version: 1
    }
  )
);

export default useRecentWorkflowsStore;
