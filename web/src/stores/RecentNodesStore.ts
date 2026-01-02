/**
 * RecentNodesStore
 * 
 * Tracks recently used/created node types for quick access in the NodeMenu.
 * Stores up to 10 most recently used node types in order of usage.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_RECENT_NODES = 10;

interface RecentNodesStore {
  recentNodeTypes: string[];
  addRecentNode: (nodeType: string) => void;
  clearRecentNodes: () => void;
}

export const useRecentNodesStore = create<RecentNodesStore>()(
  persist(
    (set) => ({
      recentNodeTypes: [],
      
      /**
       * Adds a node type to the recent nodes list.
       * If the node type already exists, it moves it to the front.
       * Maintains a maximum of MAX_RECENT_NODES entries.
       */
      addRecentNode: (nodeType: string) => {
        set((state) => {
          // Filter out the node type if it already exists
          const filtered = state.recentNodeTypes.filter(
            (type) => type !== nodeType
          );
          
          // Add the new node type at the front
          const updated = [nodeType, ...filtered];
          
          // Keep only the most recent MAX_RECENT_NODES
          return {
            recentNodeTypes: updated.slice(0, MAX_RECENT_NODES)
          };
        });
      },
      
      /**
       * Clears all recent nodes from the list.
       */
      clearRecentNodes: () => {
        set({ recentNodeTypes: [] });
      }
    }),
    {
      name: "recent-nodes-storage",
      version: 1
    }
  )
);

