import { useCallback, useMemo } from "react";
import usePerformanceProfilerStore, {
  WorkflowPerformanceProfile,
  NodePerformanceMetrics
} from "../stores/PerformanceProfilerStore";
import { useNodes } from "../contexts/NodeContext";
import useExecutionTimeStore from "../stores/ExecutionTimeStore";
import type { Node } from "@xyflow/react";

interface UseWorkflowProfilerOptions {
  workflowId: string;
  enabled?: boolean;
}

interface UseWorkflowProfilerReturn {
  isProfiling: boolean;
  startProfiling: () => void;
  stopProfiling: () => void;
  getProfile: () => WorkflowPerformanceProfile | undefined;
  getBottlenecks: () => NodePerformanceMetrics[];
  recordExecution: (nodeId: string) => void;
}

export const useWorkflowProfiler = (
  options: UseWorkflowProfilerOptions
): UseWorkflowProfilerReturn => {
  const { workflowId, enabled = true } = options;

  const isProfiling = usePerformanceProfilerStore(
    (state: { isProfiling: boolean; currentWorkflowId: string | null }) => 
      state.isProfiling && state.currentWorkflowId === workflowId
  );
  const startProfiling = usePerformanceProfilerStore(
    (state: { startProfiling: (id: string, name: string) => void }) => 
      state.startProfiling
  );
  const stopProfiling = usePerformanceProfilerStore((state: { stopProfiling: () => void }) => 
    state.stopProfiling
  );
  const recordNodeExecution = usePerformanceProfilerStore(
    (state: { recordNodeExecution: (wid: string, nid: string, nt: string, nn: string, d: number) => void }) => 
      state.recordNodeExecution
  );

  const nodes = useNodes((state: { nodes: Node[] }) => state.nodes);
  const getDuration = useExecutionTimeStore((state: { getDuration: (wid: string, nid: string) => number | undefined }) => 
    state.getDuration
  );

  const nodeMap = useMemo(() => {
    return new Map(nodes.map((n: Node) => [n.id, n]));
  }, [nodes]);

  const workflowName = useMemo(() => {
    const node = nodes[0];
    return (node?.data as { workflowName?: string })?.workflowName || "Untitled Workflow";
  }, [nodes]);

  const handleStartProfiling = useCallback(() => {
    if (enabled) {
      startProfiling(workflowId, workflowName);
    }
  }, [workflowId, workflowName, enabled, startProfiling]);

  const handleStopProfiling = useCallback(() => {
    stopProfiling();
  }, [stopProfiling]);

  const handleRecordExecution = useCallback(
    (nodeId: string) => {
      if (!isProfiling || !enabled) {
        return;
      }

      const node = nodeMap.get(nodeId);
      if (!node) {
        return;
      }

      const duration = getDuration(workflowId, nodeId);
      if (duration === undefined) {
        return;
      }

      const nodeName = (node.data as { label?: string })?.label || nodeId;
      const nodeType = node.type || "unknown";
      recordNodeExecution(
        workflowId,
        nodeId,
        nodeType,
        nodeName,
        duration
      );
    },
    [
      workflowId,
      isProfiling,
      enabled,
      nodeMap,
      getDuration,
      recordNodeExecution
    ]
  );

  const getProfile = useCallback(() => {
    const store = usePerformanceProfilerStore.getState();
    return store.profiles[workflowId];
  }, [workflowId]);

  const getBottlenecks = useCallback(() => {
    const store = usePerformanceProfilerStore.getState();
    const profile = store.profiles[workflowId];
    if (!profile) {
      return [];
    }
    
    const metrics = Object.values(profile.nodeMetrics);
    if (metrics.length === 0) {
      return [];
    }

    const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
    
    return metrics
      .filter(m => m.duration > avgDuration * 1.5)
      .sort((a, b) => b.duration - a.duration);
  }, [workflowId]);

  return {
    isProfiling,
    startProfiling: handleStartProfiling,
    stopProfiling: handleStopProfiling,
    getProfile,
    getBottlenecks,
    recordExecution: handleRecordExecution
  };
};

export default useWorkflowProfiler;
