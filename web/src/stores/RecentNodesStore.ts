/**
 * RecentNodesStore
 * 
 * Tracks recently created/used nodes for quick access in the NodeMenu.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentNode {
  nodeType: string;
  timestamp: number;
}

interface RecentNodesStore {
  recentNodes: RecentNode[];
  addRecentNode: (nodeType: string) => void;
  getRecentNodes: () => RecentNode[];
  clearRecentNodes: () => void;
}

const MAX_RECENT_NODES = 12;

export const useRecentNodesStore = create<RecentNodesStore>()(
  persist(
    (set, get) => ({
      recentNodes: [],

      addRecentNode: (nodeType: string) => {
        set((state) => {
          // Remove existing entry if it exists
          const filtered = state.recentNodes.filter(
            (node) => node.nodeType !== nodeType
          );
          
          // Add to the front with current timestamp
          const updated = [
            { nodeType, timestamp: Date.now() },
            ...filtered
          ];
          
          // Keep only the most recent MAX_RECENT_NODES
          return {
            recentNodes: updated.slice(0, MAX_RECENT_NODES)
          };
        });
      },

      getRecentNodes: () => {
        return get().recentNodes;
      },

      clearRecentNodes: () => {
        set({ recentNodes: [] });
      }
    }),
    {
      name: "nodetool-recent-nodes",
      version: 1
    }
  )
);
