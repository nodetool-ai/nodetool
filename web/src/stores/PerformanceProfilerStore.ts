/**
 * Performance Profiler Store
 *
 * Manages workflow performance profiling state and analysis results.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  WorkflowPerformance,
  PerformanceInsight,
  analyzeWorkflowPerformance,
  generatePerformanceInsights,
  calculateTimeSavings
} from "../utils/performanceProfiler";

interface ProfilerState {
  // Profiling status
  isProfiling: boolean;
  isPanelOpen: boolean;

  // Current workflow being profiled
  currentWorkflowId: string | null;

  // Performance data
  performanceData: Map<string, WorkflowPerformance>;
  historicalData: Map<string, WorkflowPerformance[]>;

  // Insights
  currentInsights: PerformanceInsight[];

  // Settings
  showBottlenecksOnly: boolean;
  autoProfileOnRun: boolean;

  // Actions
  startProfiling: (workflowId: string) => void;
  stopProfiling: () => void;
  setPanelOpen: (open: boolean) => void;
  recordExecution: (
    workflowId: string,
    nodeIds: string[],
    nodeTypes: Map<string, string>,
    durations: Map<string, number>,
    statuses: Map<string, "completed" | "failed" | "pending">
  ) => void;
  getPerformance: (workflowId: string) => WorkflowPerformance | null;
  getInsights: (workflowId: string) => PerformanceInsight[];
  toggleBottlenecksOnly: () => void;
  toggleAutoProfile: () => void;
  clearHistory: (workflowId: string) => void;
  clearAllHistory: () => void;
}

export const usePerformanceProfilerStore = create<ProfilerState>()(
  persist(
    (set, get) => ({
      isProfiling: false,
      isPanelOpen: false,
      currentWorkflowId: null,
      performanceData: new Map(),
      historicalData: new Map(),
      currentInsights: [],
      showBottlenecksOnly: false,
      autoProfileOnRun: true,

      startProfiling: (workflowId: string) => {
        set({
          isProfiling: true,
          currentWorkflowId: workflowId
        });
      },

      stopProfiling: () => {
        set({
          isProfiling: false,
          currentWorkflowId: null
        });
      },

      setPanelOpen: (open: boolean) => {
        set({ isPanelOpen: open });
      },

      recordExecution: (
        workflowId: string,
        nodeIds: string[],
        nodeTypes: Map<string, string>,
        durations: Map<string, number>,
        statuses: Map<string, "completed" | "failed" | "pending">
      ) => {
        const performance = analyzeWorkflowPerformance(
          nodeIds,
          nodeTypes,
          durations,
          statuses
        );

        const insights = generatePerformanceInsights(performance);
        const timeSavings = calculateTimeSavings(performance);

        // Store current performance
        const performanceData = new Map(get().performanceData);
        performanceData.set(workflowId, performance);

        // Store in historical data
        const historicalData = new Map(get().historicalData);
        const existing = historicalData.get(workflowId) || [];
        historicalData.set(workflowId, [...existing.slice(-9), performance]); // Keep last 10

        set({
          performanceData,
          historicalData,
          currentInsights: insights,
          isProfiling: false
        });

        // Log time savings
        if (timeSavings.percentage > 5) {
          console.log(
            `[PerformanceProfiler] Potential time savings: ${timeSavings.percentage.toFixed(1)}% (${timeSavings.estimated.toFixed(0)}ms)`
          );
        }
      },

      getPerformance: (workflowId: string) => {
        return get().performanceData.get(workflowId) || null;
      },

      getInsights: (workflowId: string) => {
        const performance = get().performanceData.get(workflowId);
        if (!performance) {
          return [];
        }
        return generatePerformanceInsights(performance);
      },

      toggleBottlenecksOnly: () => {
        set({ showBottlenecksOnly: !get().showBottlenecksOnly });
      },

      toggleAutoProfile: () => {
        set({ autoProfileOnRun: !get().autoProfileOnRun });
      },

      clearHistory: (workflowId: string) => {
        const performanceData = new Map(get().performanceData);
        const historicalData = new Map(get().historicalData);

        performanceData.delete(workflowId);
        historicalData.delete(workflowId);

        set({ performanceData, historicalData });
      },

      clearAllHistory: () => {
        set({
          performanceData: new Map(),
          historicalData: new Map(),
          currentInsights: []
        });
      }
    }),
    {
      name: "performance-profiler-storage",
      partialize: (state) => ({
        showBottlenecksOnly: state.showBottlenecksOnly,
        autoProfileOnRun: state.autoProfileOnRun
        // Don't persist performance data - it's ephemeral
      })
    }
  )
);

export default usePerformanceProfilerStore;
