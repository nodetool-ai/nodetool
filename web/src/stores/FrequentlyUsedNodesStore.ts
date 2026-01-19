/**
 * FrequentlyUsedNodesStore
 *
 * Tracks frequently used nodes based on usage frequency.
 * Displays the most used nodes in the NodeMenu for quick access.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FrequentlyUsedNode {
  nodeType: string;
  count: number;
  lastUsed: number;
}

interface FrequentlyUsedNodesStore {
  usageMap: Record<string, number>;
  lastUsedMap: Record<string, number>;
  incrementUsage: (nodeType: string) => void;
  getFrequentlyUsed: (limit?: number) => FrequentlyUsedNode[];
  clearUsageData: () => void;
}

const MAX_FREQUENTLY_USED = 8;

export const useFrequentlyUsedNodesStore = create<FrequentlyUsedNodesStore>()(
  persist(
    (set, get) => ({
      usageMap: {},
      lastUsedMap: {},

      incrementUsage: (nodeType: string) => {
        const now = Date.now();
        set((state) => {
          const currentCount = state.usageMap[nodeType] || 0;
          return {
            usageMap: {
              ...state.usageMap,
              [nodeType]: currentCount + 1
            },
            lastUsedMap: {
              ...state.lastUsedMap,
              [nodeType]: now
            }
          };
        });
      },

      getFrequentlyUsed: (limit?: number): FrequentlyUsedNode[] => {
        const { usageMap, lastUsedMap } = get();
        const maxResults = limit ?? MAX_FREQUENTLY_USED;

        const nodes: FrequentlyUsedNode[] = Object.entries(usageMap).map(
          ([nodeType, count]) => ({
            nodeType,
            count,
            lastUsed: lastUsedMap[nodeType] || 0
          })
        );

        nodes.sort((a, b) => {
          if (b.count !== a.count) {
            return b.count - a.count;
          }
          return b.lastUsed - a.lastUsed;
        });

        return nodes.slice(0, maxResults);
      },

      clearUsageData: () => {
        set({ usageMap: {}, lastUsedMap: {} });
      }
    }),
    {
      name: "nodetool-frequently-used-nodes",
      version: 1
    }
  )
);
