/**
 * WorkflowProfiler Hook
 * 
 * Provides workflow profiling functionality for analyzing workflow performance,
 * detecting bottlenecks, and generating optimization suggestions.
 */

import { useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { useProfileStore, WorkflowProfile } from "../stores/WorkflowProfilerStore";

export interface UseWorkflowProfilerReturn {
  profile: WorkflowProfile | null;
  isAnalyzing: boolean;
  analyzeWorkflow: (nodes: Node[], edges: Edge[], workflowId: string) => WorkflowProfile;
  clearProfile: () => void;
  getComplexityColor: (score: number) => string;
  getSeverityColor: (severity: "high" | "medium" | "low") => string;
}

export const useWorkflowProfiler = (): UseWorkflowProfilerReturn => {
  const { currentProfile, isAnalyzing, analyzeWorkflow, clearProfile, setAnalyzing } = useProfileStore();

  const wrappedAnalyzeWorkflow = useCallback((nodes: Node[], edges: Edge[], workflowId: string) => {
    setAnalyzing(true);
    const profile = analyzeWorkflow(nodes, edges, workflowId);
    return profile;
  }, [analyzeWorkflow, setAnalyzing]);

  const getComplexityColor = useCallback((score: number): string => {
    if (score < 30) { return "#4caf50"; }
    if (score < 70) { return "#ff9800"; }
    if (score < 100) { return "#f44336"; }
    return "#9c27b0";
  }, []);

  const getSeverityColor = useCallback((severity: "high" | "medium" | "low"): string => {
    switch (severity) {
      case "high": { return "#f44336"; }
      case "medium": { return "#ff9800"; }
      case "low": { return "#4caf50"; }
      default: { return "#9e9e9e"; }
    }
  }, []);

  return {
    profile: currentProfile,
    isAnalyzing,
    analyzeWorkflow: wrappedAnalyzeWorkflow,
    clearProfile,
    getComplexityColor,
    getSeverityColor
  };
};
