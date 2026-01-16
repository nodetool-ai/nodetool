import { useCallback, useMemo } from "react";
import usePerformanceProfilerStore from "../stores/PerformanceProfilerStore";
import { useNodes } from "../contexts/NodeContext";

interface UsePerformanceProfilerOptions {
  workflowId: string;
  workflowName: string;
  onBottleneckDetected?: (nodeId: string, duration: number) => void;
}

export const usePerformanceProfiler = ({
  workflowId,
  workflowName,
  onBottleneckDetected
}: UsePerformanceProfilerOptions) => {
  const nodeTimingsRef = useMemo(() => new Map<string, number>(), []);
  const startProfiling = usePerformanceProfilerStore((state) => state.startProfiling);
  const endProfiling = usePerformanceProfilerStore((state) => state.endProfiling);
  const getNodeStats = usePerformanceProfilerStore((state) => state.getNodeStats);
  const getBottlenecks = usePerformanceProfilerStore((state) => state.getBottlenecks);

  const nodes = useNodes((state) => state.nodes);
  const nodeTypes = useMemo(() => {
    const types: Record<string, { type: string; label: string }> = {};
    for (const node of nodes) {
      types[node.id] = {
        type: node.type || "unknown",
        label: node.data?.title || node.id
      };
    }
    return types;
  }, [nodes]);

  const onRunStart = useCallback(() => {
    nodeTimingsRef.clear();
    startProfiling(workflowId);
  }, [workflowId, startProfiling, nodeTimingsRef]);

  const onNodeComplete = useCallback((nodeId: string, duration: number) => {
    nodeTimingsRef.set(nodeId, duration);

    const avgDuration = getNodeStats(workflowId, nodeId)?.avgDuration || 0;
    const bottlenecks = getBottlenecks(workflowId);

    if (bottlenecks.includes(nodeId) || duration > avgDuration * 1.5) {
      onBottleneckDetected?.(nodeId, duration);
    }
  }, [workflowId, getNodeStats, getBottlenecks, onBottleneckDetected, nodeTimingsRef]);

  const onRunComplete = useCallback((totalDuration: number) => {
    const nodeTimings: Record<string, number> = {};
    nodeTimingsRef.forEach((duration, nodeId) => {
      nodeTimings[nodeId] = duration;
    });

    endProfiling(
      workflowId,
      workflowName,
      totalDuration,
      nodeTimings,
      nodeTypes
    );
  }, [workflowId, workflowName, nodeTypes, endProfiling, nodeTimingsRef]);

  const getCurrentTimings = useCallback(() => {
    const timings: Record<string, number> = {};
    nodeTimingsRef.forEach((duration, nodeId) => {
      timings[nodeId] = duration;
    });
    return timings;
  }, [nodeTimingsRef]);

  return {
    onRunStart,
    onRunComplete,
    onNodeComplete,
    getCurrentTimings
  };
};
