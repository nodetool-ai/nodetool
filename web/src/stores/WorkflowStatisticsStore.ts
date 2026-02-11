/**
 * WorkflowStatisticsStore
 *
 * Manages state for the workflow statistics panel.
 * Tracks visibility and calculation preferences for workflow metrics.
 *
 * Features:
 * - Toggle panel visibility
 * - Persist user preferences to localStorage
 * - Calculate node and edge statistics
 * - Track node type distribution
 * - Identify potentially expensive nodes
 *
 * @example
 * ```typescript
 * import { useWorkflowStatisticsStore } from './WorkflowStatisticsStore';
 *
 * const isOpen = useWorkflowStatisticsStore(state => state.isOpen);
 * const toggle = useWorkflowStatisticsStore(state => state.toggle);
 * ```
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NodeTypeStats {
  type: string;
  count: number;
  category: "input" | "processing" | "output" | "constant" | "group" | "comment" | "other";
}

export interface WorkflowStats {
  totalNodes: number;
  totalEdges: number;
  selectedNodes: number;
  nodeTypeStats: NodeTypeStats[];
  hasLoops: boolean;
  hasBypassedNodes: boolean;
  estimatedComplexity: "simple" | "moderate" | "complex";
}

interface WorkflowStatisticsStore {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

export const useWorkflowStatisticsStore = create<WorkflowStatisticsStore>()(
  persist(
    (set) => ({
      isOpen: false,

      toggle: () => {
        set((state) => ({ isOpen: !state.isOpen }));
      },

      open: () => {
        set({ isOpen: true });
      },

      close: () => {
        set({ isOpen: false });
      }
    }),
    {
      name: "nodetool-workflow-statistics",
      version: 1
    }
  )
);
