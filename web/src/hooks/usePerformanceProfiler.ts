import { useCallback, useRef } from "react";
import usePerformanceStore, { NodePerformanceMetrics } from "../stores/PerformanceStore";
import { useNodes } from "../contexts/NodeContext";

interface PerformanceProfilerOptions {
  autoStart?: boolean;
  trackMemory?: boolean;
}

interface _ProfilerState {
  nodeStartTimes: Map<string, number>;
  isActive: boolean;
}

export interface PerformanceProfilerActions {
  startProfiling: () => void;
  stopProfiling: () => void;
  recordNodeStart: (nodeId: string) => void;
  recordNodeComplete: (nodeId: string, duration: number, outputSize?: number) => void;
  recordNodeError: (nodeId: string, errorMessage: string) => void;
  clearProfiling: () => void;
  getMetrics: (nodeId: string) => NodePerformanceMetrics | undefined;
  getAllMetrics: () => NodePerformanceMetrics[];
  getSlowestNodes: (limit?: number) => NodePerformanceMetrics[];
  isProfiling: boolean;
}

export const usePerformanceProfiler = (
  workflowId: string,
  options: PerformanceProfilerOptions = {}
): PerformanceProfilerActions => {
  const { autoStart = false, trackMemory: _trackMemory = false } = options;
  const nodeStartTimes = useRef<Map<string, number>>(new Map());
  const isActiveRef = useRef(autoStart);

  const nodes = useNodes((state) => state.nodes);

  const {
    startProfiling,
    stopProfiling,
    recordNodeStart: storeRecordNodeStart,
    recordNodeComplete: storeRecordNodeComplete,
    recordNodeError: storeRecordNodeError,
    clearMetrics,
    getMetrics,
    getAllMetrics,
    getSlowestNodes,
    isProfiling: storeIsProfiling
  } = usePerformanceStore();

  const startProfilingCallback = useCallback(() => {
    const nodeNames: Record<string, string> = {};
    const nodeTypes: Record<string, string> = {};

    for (const node of nodes) {
      nodeNames[node.id] = node.data.title || node.id;
      nodeTypes[node.id] = node.type || "unknown";
    }

    nodeStartTimes.current.clear();
    startProfiling(workflowId, nodes.map((n) => n.id), nodeNames, nodeTypes);
    isActiveRef.current = true;
  }, [workflowId, nodes, startProfiling]);

  const stopProfilingCallback = useCallback(() => {
    stopProfiling();
    isActiveRef.current = false;
  }, [stopProfiling]);

  const recordNodeStartCallback = useCallback((nodeId: string) => {
    if (!isActiveRef.current) {
      return;
    }
    nodeStartTimes.current.set(nodeId, Date.now());
    storeRecordNodeStart(nodeId);
  }, [storeRecordNodeStart]);

  const recordNodeCompleteCallback = useCallback(
    (nodeId: string, duration: number, outputSize?: number) => {
      if (!isActiveRef.current) {
        return;
      }
      const startTime = nodeStartTimes.current.get(nodeId);
      if (startTime) {
        const elapsed = Date.now() - startTime;
        const actualDuration = duration || elapsed;
        nodeStartTimes.current.delete(nodeId);
        storeRecordNodeComplete(nodeId, actualDuration, outputSize);
      }
    },
    [storeRecordNodeComplete]
  );

  const recordNodeErrorCallback = useCallback(
    (nodeId: string, errorMessage: string) => {
      if (!isActiveRef.current) {
        return;
      }
      nodeStartTimes.current.delete(nodeId);
      storeRecordNodeError(nodeId, errorMessage);
    },
    [storeRecordNodeError]
  );

  const clearProfilingCallback = useCallback(() => {
    nodeStartTimes.current.clear();
    clearMetrics();
    isActiveRef.current = autoStart;
  }, [clearMetrics, autoStart]);

  return {
    startProfiling: startProfilingCallback,
    stopProfiling: stopProfilingCallback,
    recordNodeStart: recordNodeStartCallback,
    recordNodeComplete: recordNodeCompleteCallback,
    recordNodeError: recordNodeErrorCallback,
    clearProfiling: clearProfilingCallback,
    getMetrics,
    getAllMetrics,
    getSlowestNodes,
    isProfiling: storeIsProfiling
  };
};

export default usePerformanceProfiler;
