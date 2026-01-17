/**
 * useWorkflowProfiler Hook
 *
 * Provides workflow performance profiling capabilities including:
 * - Recording and tracking execution metrics
 * - Analyzing bottlenecks and performance insights
 * - Comparing runs and detecting regressions
 * - Calculating parallelization efficiency
 */

import { useCallback } from "react";
import useWorkflowProfilerStore, {
  WorkflowRunProfile,
  BottleneckAnalysis,
  ParallelizationAnalysis,
  PerformanceInsight
} from "../stores/WorkflowProfilerStore";
import { Graph } from "../stores/ApiTypes";

interface UseWorkflowProfilerReturn {
  startRecording: () => string;
  endRecording: (status: "completed" | "failed" | "cancelled") => void;
  recordNodeExecution: (nodeId: string, nodeType: string, duration: number, status: "completed" | "failed" | "cancelled" | "pending") => void;
  getLatestProfile: () => WorkflowRunProfile | null;
  getProfiles: () => WorkflowRunProfile[];
  getBottlenecks: (limit?: number) => BottleneckAnalysis[];
  getParallelizationAnalysis: (graph: Graph) => ParallelizationAnalysis;
  getPerformanceInsights: (graph: Graph) => PerformanceInsight[];
  isRecording: boolean;
  clearProfiles: () => void;
}

export const useWorkflowProfiler = (workflowId: string): UseWorkflowProfilerReturn => {
  const store = useWorkflowProfilerStore();

  const startRecording = useCallback(() => {
    return store.startRecording(workflowId);
  }, [store, workflowId]);

  const endRecording = useCallback(
    (status: "completed" | "failed" | "cancelled") => {
      store.endRecording(workflowId, status);
    },
    [store, workflowId]
  );

  const recordNodeExecution = useCallback(
    (nodeId: string, nodeType: string, duration: number, status: "completed" | "failed" | "cancelled" | "pending") => {
      store.recordNodeExecution(workflowId, nodeId, nodeType, duration, status);
    },
    [store, workflowId]
  );

  const getLatestProfile = useCallback(() => {
    return store.getLatestProfile(workflowId);
  }, [store, workflowId]);

  const getProfiles = useCallback(() => {
    return store.getProfiles(workflowId);
  }, [store, workflowId]);

  const getBottlenecks = useCallback(
    (limit?: number) => {
      return store.getBottlenecks(workflowId, limit);
    },
    [store, workflowId]
  );

  const getParallelizationAnalysis = useCallback(
    (graph: Graph) => {
      return store.getParallelizationAnalysis(workflowId, graph);
    },
    [store, workflowId]
  );

  const getPerformanceInsights = useCallback(
    (graph: Graph) => {
      return store.getPerformanceInsights(workflowId, graph);
    },
    [store, workflowId]
  );

  const clearProfiles = useCallback(() => {
    store.clearProfiles(workflowId);
  }, [store, workflowId]);

  return {
    startRecording,
    endRecording,
    recordNodeExecution,
    getLatestProfile,
    getProfiles,
    getBottlenecks,
    getParallelizationAnalysis,
    getPerformanceInsights,
    isRecording: store.isRecording,
    clearProfiles
  };
};

export default useWorkflowProfiler;
