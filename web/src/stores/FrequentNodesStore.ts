/**
 * FrequentNodesStore
 *
 * Tracks frequently used nodes for smart suggestions in the NodeMenu.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FrequentNode {
  nodeType: string;
  count: number;
  lastUsed: number;
}

interface FrequentNodesStore {
  frequentNodes: FrequentNode[];
  incrementUsage: (nodeType: string) => void;
  getMostFrequent: (limit?: number) => FrequentNode[];
  getUsageCount: (nodeType: string) => number;
  resetUsage: () => void;
  getTopNodeTypes: () => string[];
}

const MAX_FREQUENT_NODES = 20;
const MIN_USAGE_FOR_SUGGESTION = 2;

export const useFrequentNodesStore = create<FrequentNodesStore>()(
  persist(
    (set, get) => ({
      frequentNodes: [],

      incrementUsage: (nodeType: string) => {
        set((state) => {
          const existingIndex = state.frequentNodes.findIndex(
            (n) => n.nodeType === nodeType
          );

          if (existingIndex >= 0) {
            const updated = [...state.frequentNodes];
            updated[existingIndex] = {
              nodeType,
              count: updated[existingIndex].count + 1,
              lastUsed: Date.now()
            };
            return { frequentNodes: updated };
          }

          const updated = [
            { nodeType, count: 1, lastUsed: Date.now() },
            ...state.frequentNodes
          ];

          return {
            frequentNodes: updated.slice(0, MAX_FREQUENT_NODES)
          };
        });
      },

      getMostFrequent: (limit: number = 6) => {
        const { frequentNodes } = get();
        return frequentNodes
          .filter((n) => n.count >= MIN_USAGE_FOR_SUGGESTION)
          .sort((a, b) => {
            if (b.count !== a.count) {
              return b.count - a.count;
            }
            return b.lastUsed - a.lastUsed;
          })
          .slice(0, limit);
      },

      getUsageCount: (nodeType: string) => {
        const node = get().frequentNodes.find((n) => n.nodeType === nodeType);
        return node?.count ?? 0;
      },

      resetUsage: () => {
        set({ frequentNodes: [] });
      },

      getTopNodeTypes: () => {
        return get()
          .getMostFrequent(MAX_FREQUENT_NODES)
          .map((n) => n.nodeType);
      }
    }),
    {
      name: "nodetool-frequent-nodes",
      version: 1
    }
  )
);

export default useFrequentNodesStore;
