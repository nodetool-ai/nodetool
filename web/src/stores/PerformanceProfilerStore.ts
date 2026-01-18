/**
 * PerformanceProfilerStore
 *
 * Stores performance analysis data for workflow profiling.
 * Provides bottleneck identification and optimization suggestions.
 */

import { create } from "zustand";

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  duration: number;
  status: "completed" | "error" | "running" | "pending";
  isParallelizable: boolean;
  inputSize?: number;
  outputSize?: number;
}

export interface PerformanceProfile {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
  nodes: NodePerformanceMetrics[];
  bottlenecks: NodePerformanceMetrics[];
  parallelismScore: number;
  timestamp: number;
}

export interface OptimizationSuggestion {
  type: "parallel" | "cache" | "batch" | "model" | "structure";
  severity: "info" | "warning" | "error";
  title: string;
  description: string;
  affectedNodes: string[];
  potentialSavings?: number;
}

interface PerformanceProfilerState {
  currentProfile: PerformanceProfile | null;
  historicalProfiles: PerformanceProfile[];
  isAnalyzing: boolean;
  lastAnalysisTime: number | null;

  setProfile: (profile: PerformanceProfile) => void;
  addHistoricalProfile: (profile: PerformanceProfile) => void;
  clearProfiles: (workflowId?: string) => void;
  setAnalyzing: (analyzing: boolean) => void;
  getBottleneckCount: () => number;
  getTotalPotentialSavings: () => number;
}

const usePerformanceProfilerStore = create<PerformanceProfilerState>((set, get) => ({
  currentProfile: null,
  historicalProfiles: [],
  isAnalyzing: false,
  lastAnalysisTime: null,

  setProfile: (profile: PerformanceProfile) => {
    set({
      currentProfile: profile,
      lastAnalysisTime: Date.now()
    });
  },

  addHistoricalProfile: (profile: PerformanceProfile) => {
    const current = get().historicalProfiles;
    const updated = [profile, ...current].slice(0, 20);
    set({ historicalProfiles: updated });
  },

  clearProfiles: (workflowId?: string) => {
    if (workflowId) {
      const current = get().currentProfile;
      const historical = get().historicalProfiles.filter(p => p.workflowId !== workflowId);
      set({
        currentProfile: current?.workflowId === workflowId ? null : current,
        historicalProfiles: historical
      });
    } else {
      set({
        currentProfile: null,
        historicalProfiles: []
      });
    }
  },

  setAnalyzing: (analyzing: boolean) => {
    set({ isAnalyzing: analyzing });
  },

  getBottleneckCount: () => {
    const profile = get().currentProfile;
    return profile?.bottlenecks.length || 0;
  },

  getTotalPotentialSavings: () => {
    const profile = get().currentProfile;
    if (!profile) {
      return 0;
    }
    return profile.bottlenecks.reduce((sum, node) => {
      return sum + (node.isParallelizable ? Math.floor(node.duration * 0.7) : 0);
    }, 0);
  }
}));

export default usePerformanceProfilerStore;
