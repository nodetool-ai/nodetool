/**
 * Workflow Profiler Hook
 *
 * React hook for analyzing workflow performance and generating profiling reports.
 *
 * This is an EXPERIMENTAL research feature for analyzing workflow performance.
 */

import { useCallback } from "react";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useWorkflowProfilerStore, {
  WorkflowPerformanceProfile,
  NodePerformanceProfile,
} from "../stores/WorkflowProfilerStore";

export type { NodePerformanceProfile };

interface UseWorkflowProfilerReturn {
  profile: WorkflowPerformanceProfile | undefined;
  analyzeWorkflow: (
    nodes: Node<NodeData>[],
    edges: Edge[]
  ) => WorkflowPerformanceProfile;
  clearProfile: () => void;
  getNodeProfile: (nodeId: string) => NodePerformanceProfile | undefined;
  isAnalyzing: boolean;
}

export const useWorkflowProfiler = (
  workflowId: string
): UseWorkflowProfilerReturn => {
  const profile = useWorkflowProfilerStore((state) =>
    state.getProfile(workflowId)
  );
  const analyzeWorkflowStore = useWorkflowProfilerStore(
    (state) => state.analyzeWorkflow
  );
  const clearProfileStore = useWorkflowProfilerStore(
    (state) => state.clearProfile
  );

  const analyzeWorkflow = useCallback(
    (nodes: Node<NodeData>[], edges: Edge[]) => {
      return analyzeWorkflowStore(workflowId, nodes, edges);
    },
    [analyzeWorkflowStore, workflowId]
  );

  const clearProfile = useCallback(() => {
    clearProfileStore(workflowId);
  }, [clearProfileStore, workflowId]);

  const getNodeProfile = useCallback(
    (nodeId: string) => {
      if (!profile) return undefined;
      return profile.nodeProfiles.find((p) => p.nodeId === nodeId);
    },
    [profile]
  );

  return {
    profile,
    analyzeWorkflow,
    clearProfile,
    getNodeProfile,
    isAnalyzing: false,
  };
};

export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    const seconds = ms / 1000;
    const remainingMs = ms % 1000;
    return `${seconds.toFixed(1)}s ${remainingMs}ms`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const remainingSeconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${remainingSeconds}s`;
  }
};

export const getComplexityColor = (
  complexity: "low" | "medium" | "high"
): string => {
  switch (complexity) {
    case "low":
      return "success.main";
    case "medium":
      return "warning.main";
    case "high":
      return "error.main";
    default:
      return "text.primary";
  }
};

export const getComplexityLabel = (
  complexity: "low" | "medium" | "high"
): string => {
  switch (complexity) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    default:
      return "Unknown";
  }
};
