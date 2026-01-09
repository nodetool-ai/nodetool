/**
 * MostUsedNodesStore
 *
 * Tracks most frequently used nodes for quick access in the NodeMenu.
 * Automatically tracks node usage when nodes are created via useCreateNode.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UsedNode {
  nodeType: string;
  count: number;
  lastUsed: number;
}

interface MostUsedNodesStore {
  usedNodes: UsedNode[];
  incrementUsage: (nodeType: string) => void;
  getMostUsed: (limit?: number) => UsedNode[];
  getUsageCount: (nodeType: string) => number;
  clearUsageData: () => void;
  getTopNodeTypes: () => string[];
}

const MAX_TRACKED_NODES = 50;
const MAX_DISPLAY_COUNT = 12;

export const useMostUsedNodesStore = create<MostUsedNodesStore>()(
  persist(
    (set, get) => ({
      usedNodes: [],

      incrementUsage: (nodeType: string) => {
        set((state) => {
          const existingIndex = state.usedNodes.findIndex(
            (n) => n.nodeType === nodeType
          );

          if (existingIndex >= 0) {
            const updated = [...state.usedNodes];
            updated[existingIndex] = {
              ...updated[existingIndex],
              count: updated[existingIndex].count + 1,
              lastUsed: Date.now()
            };
            return { usedNodes: updated };
          }

          const newNode: UsedNode = {
            nodeType,
            count: 1,
            lastUsed: Date.now()
          };

          const updated = [newNode, ...state.usedNodes];

          return {
            usedNodes: updated.slice(0, MAX_TRACKED_NODES)
          };
        });
      },

      getMostUsed: (limit: number = MAX_DISPLAY_COUNT) => {
        const nodes = get().usedNodes;
        return nodes
          .slice()
          .sort((a, b) => {
            if (b.count !== a.count) {
              return b.count - a.count;
            }
            return b.lastUsed - a.lastUsed;
          })
          .slice(0, limit);
      },

      getUsageCount: (nodeType: string) => {
        const node = get().usedNodes.find((n) => n.nodeType === nodeType);
        return node ? node.count : 0;
      },

      clearUsageData: () => {
        set({ usedNodes: [] });
      },

      getTopNodeTypes: () => {
        return get()
          .getMostUsed(MAX_DISPLAY_COUNT)
          .map((n) => n.nodeType);
      }
    }),
    {
      name: "nodetool-most-used-nodes",
      version: 1
    }
  )
);

export default useMostUsedNodesStore;
