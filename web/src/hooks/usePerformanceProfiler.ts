/**
 * Hook for integrating Performance Profiler with workflow execution.
 *
 * Tracks node performance during workflow runs and provides access to
 * profiling data and reports.
 *
 * @example
 * ```typescript
 * const { showProfiler, toggleProfiler, report } = usePerformanceProfiler(workflowId);
 * ```
 */
import { useCallback, useMemo, useState } from "react";
import usePerformanceProfilerStore, {
  WorkflowPerformanceReport
} from "../stores/PerformanceProfilerStore";

interface UsePerformanceProfilerReturn {
  showProfiler: boolean;
  toggleProfiler: () => void;
  closeProfiler: () => void;
  report: WorkflowPerformanceReport | null;
  clearProfiler: () => void;
}

export const usePerformanceProfiler = (
  workflowId: string,
  nodeTypes: Record<string, { label: string; memoryMB?: number; compute?: number }>
): UsePerformanceProfilerReturn => {
  const [showProfiler, setShowProfiler] = useState(false);

  const generateReport = usePerformanceProfilerStore((state) =>
    state.generateReport.bind(state, workflowId, nodeTypes)
  );

  const clearMetrics = usePerformanceProfilerStore((state) =>
    state.clearMetrics.bind(state, workflowId)
  );

  const report = useMemo(
    () => generateReport(),
    [workflowId, nodeTypes, generateReport]
  );

  const toggleProfiler = useCallback(() => {
    setShowProfiler((prev) => !prev);
  }, []);

  const closeProfiler = useCallback(() => {
    setShowProfiler(false);
  }, []);

  const clearProfiler = useCallback(() => {
    clearMetrics();
    setShowProfiler(false);
  }, [clearMetrics]);

  return {
    showProfiler,
    toggleProfiler,
    closeProfiler,
    report,
    clearProfiler
  };
};

export default usePerformanceProfiler;
