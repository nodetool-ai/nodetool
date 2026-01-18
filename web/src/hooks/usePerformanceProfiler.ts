import { useCallback } from 'react';
import { usePerformanceProfileStore, WorkflowProfile } from '../stores/PerformanceProfileStore';

interface UsePerformanceProfilerReturn {
  profile: WorkflowProfile | null;
  isAnalyzing: boolean;
  error: string | null;
  analyzeWorkflow: (
    workflowId: string,
    nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>,
    edges: Array<{ source: string; target: string }>
  ) => WorkflowProfile | null;
  clearProfile: () => void;
  clearError: () => void;
}

export const usePerformanceProfiler = (): UsePerformanceProfilerReturn => {
  const { currentProfile, isAnalyzing, lastError, actions } = usePerformanceProfileStore();

  const analyzeWorkflow = useCallback(
    (
      workflowId: string,
      nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>,
      edges: Array<{ source: string; target: string }>
    ): WorkflowProfile | null => {
      try {
        const profile = actions.analyzeWorkflow(workflowId, nodes, edges);
        return profile;
      } catch {
        return null;
      }
    },
    [actions]
  );

  const clearProfile = useCallback(() => {
    actions.clearProfile();
  }, [actions]);

  const clearError = useCallback(() => {
    actions.clearError();
  }, [actions]);

  return {
    profile: currentProfile,
    isAnalyzing,
    error: lastError,
    analyzeWorkflow,
    clearProfile,
    clearError,
  };
};

export default usePerformanceProfiler;
