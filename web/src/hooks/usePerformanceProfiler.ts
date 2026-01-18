/**
 * usePerformanceProfiler Hook
 *
 * Provides easy integration of performance profiling with workflow execution.
 */

import { useCallback, useEffect, useRef } from "react";
import usePerformanceProfilerStore, { PerformanceReport } from "../stores/PerformanceProfilerStore";

interface UsePerformanceProfilerOptions {
  enabled?: boolean;
  autoStart?: boolean;
  onBottleneckDetected?: (nodeId: string, duration: number) => void;
}

interface UsePerformanceProfilerReturn {
  startProfiling: () => void;
  stopProfiling: () => void;
  recordNodeStart: (nodeId: string) => void;
  recordNodeEnd: (nodeId: string, duration: number, success: boolean) => void;
  getReport: () => PerformanceReport;
  isProfiling: boolean;
  clearSession: () => void;
}

export const usePerformanceProfiler = (
  _options: UsePerformanceProfilerOptions = {}
): UsePerformanceProfilerReturn => {
  const enabled = _options.enabled ?? true;
  const autoStart = _options.autoStart ?? false;
  const onBottleneckDetected = _options.onBottleneckDetected;

  const {
    startProfiling,
    endProfiling,
    recordNodeStart,
    recordNodeEnd,
    recordNodeDuration,
    generateReport,
    clearCurrentSession,
    isProfiling,
    getBottlenecks
  } = usePerformanceProfilerStore();

  const workflowIdRef = useRef<string>("unknown");
  const nodeStartTimesRef = useRef<Map<string, number>>(new Map());

  const handleStartProfiling = useCallback(() => {
    if (!enabled) return;

    const workflowId = workflowIdRef.current || "unknown";
    const workflowName = "Current Workflow";

    startProfiling(workflowId, workflowName, []);
    nodeStartTimesRef.current.clear();
  }, [enabled, startProfiling]);

  const handleStopProfiling = useCallback(() => {
    if (!enabled) return;
    endProfiling();
  }, [enabled, endProfiling]);

  const handleRecordNodeStart = useCallback((nodeId: string) => {
    if (!enabled || !isProfiling) return;
    nodeStartTimesRef.current.set(nodeId, Date.now());
    recordNodeStart(nodeId);
  }, [enabled, isProfiling, recordNodeStart]);

  const handleRecordNodeEnd = useCallback((nodeId: string, duration: number, success: boolean) => {
    if (!enabled || !isProfiling) return;
    recordNodeDuration(nodeId, duration);
    recordNodeEnd(nodeId, success);
    nodeStartTimesRef.current.delete(nodeId);

    const bottlenecks = getBottlenecks();
    const bottleneck = bottlenecks.find(b => b.nodeId === nodeId);
    if (bottleneck && onBottleneckDetected) {
      onBottleneckDetected(nodeId, duration);
    }
  }, [enabled, isProfiling, recordNodeDuration, recordNodeEnd, getBottlenecks, onBottleneckDetected]);

  const handleClearSession = useCallback(() => {
    clearCurrentSession();
    nodeStartTimesRef.current.clear();
  }, [clearCurrentSession]);

  const handleGetReport = useCallback(() => {
    return generateReport();
  }, [generateReport]);

  useEffect(() => {
    if (autoStart && enabled) {
      handleStartProfiling();
    }
  }, [autoStart, enabled, handleStartProfiling]);

  useEffect(() => {
    return () => {
      if (isProfiling) {
        endProfiling();
      }
    };
  }, [isProfiling, endProfiling]);

  return {
    startProfiling: handleStartProfiling,
    stopProfiling: handleStopProfiling,
    recordNodeStart: handleRecordNodeStart,
    recordNodeEnd: handleRecordNodeEnd,
    getReport: handleGetReport,
    isProfiling,
    clearSession: handleClearSession
  };
};

export default usePerformanceProfiler;
