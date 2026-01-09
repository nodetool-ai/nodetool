/**
 * MostUsedNodesStore
 *
 * Tracks most frequently used nodes for quick access in the NodeMenu.
 * Persists to localStorage for cross-session availability.
 * Nodes are ordered by usage count, with most used first.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MostUsedNode {
  nodeType: string;
  count: number;
}

interface MostUsedNodesStore {
  mostUsedNodes: MostUsedNode[];
  incrementUsage: (nodeType: string) => void;
  getMostUsedNodes: () => MostUsedNode[];
  clearMostUsedNodes: () => void;
  getUsageCount: (nodeType: string) => number;
}

const MAX_MOST_USED_NODES = 12;

export const useMostUsedNodesStore = create<MostUsedNodesStore>()(
  persist(
    (set, get) => ({
      mostUsedNodes: [],

      incrementUsage: (nodeType: string) => {
        set((state) => {
          const existingIndex = state.mostUsedNodes.findIndex(
            (node) => node.nodeType === nodeType
          );

          let updated: MostUsedNode[];

          if (existingIndex !== -1) {
            updated = state.mostUsedNodes.map((node, index) =>
              index === existingIndex
                ? { ...node, count: node.count + 1 }
                : node
            );
          } else {
            updated = [
              { nodeType, count: 1 },
              ...state.mostUsedNodes
            ];
          }

          updated = updated
            .sort((a, b) => b.count - a.count)
            .slice(0, MAX_MOST_USED_NODES);

          return {
            mostUsedNodes: updated
          };
        });
      },

      getMostUsedNodes: () => {
        return get().mostUsedNodes;
      },

      clearMostUsedNodes: () => {
        set({ mostUsedNodes: [] });
      },

      getUsageCount: (nodeType: string) => {
        const node = get().mostUsedNodes.find(
          (n) => n.nodeType === nodeType
        );
        return node ? node.count : 0;
      }
    }),
    {
      name: "nodetool-most-used-nodes",
      version: 1
    }
  )
);

export default useMostUsedNodesStore;
