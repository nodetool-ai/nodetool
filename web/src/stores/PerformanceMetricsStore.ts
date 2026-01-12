import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ExecutionMetric {
  nodeType: string;
  timestamp: number;
  durationMs: number;
  workflowId: string;
  nodeId: string;
}

interface NodeTypeMetrics {
  nodeType: string;
  executionCount: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  lastExecutionMs: number;
  lastExecutedAt: number;
}

interface PerformanceMetricsState {
  metrics: ExecutionMetric[];
  nodeTypeMetrics: Record<string, NodeTypeMetrics>;

  recordExecution: (
    nodeType: string,
    durationMs: number,
    workflowId: string,
    nodeId: string
  ) => void;

  getNodeTypeMetrics: (nodeType: string) => NodeTypeMetrics | undefined;

  getAverageDuration: (nodeType: string) => number | null;

  getPerformanceTrend: (nodeType: string) => "faster" | "slower" | "normal" | null;

  clearMetrics: () => void;

  clearNodeTypeMetrics: (nodeType: string) => void;

  trimOldMetrics: (maxEntries: number) => void;
}

const MAX_METRICS_ENTRIES = 10000;
const MIN_SAMPLES_FOR_TREND = 3;

const calculateNodeTypeMetrics = (
  existing: NodeTypeMetrics | undefined,
  durationMs: number
): NodeTypeMetrics => {
  if (!existing) {
    return {
      nodeType: "",
      executionCount: 1,
      totalDurationMs: durationMs,
      minDurationMs: durationMs,
      maxDurationMs: durationMs,
      lastExecutionMs: durationMs,
      lastExecutedAt: Date.now()
    };
  }

  const newExecutionCount = existing.executionCount + 1;
  const newTotalDuration = existing.totalDurationMs + durationMs;

  return {
    ...existing,
    executionCount: newExecutionCount,
    totalDurationMs: newTotalDuration,
    minDurationMs: Math.min(existing.minDurationMs, durationMs),
    maxDurationMs: Math.max(existing.maxDurationMs, durationMs),
    lastExecutionMs: durationMs,
    lastExecutedAt: Date.now()
  };
};

export const usePerformanceMetricsStore = create<PerformanceMetricsState>()(
  persist(
    (set, get) => ({
      metrics: [],
      nodeTypeMetrics: {},

      recordExecution: (nodeType, durationMs, workflowId, nodeId) => {
        const executionMetric: ExecutionMetric = {
          nodeType,
          timestamp: Date.now(),
          durationMs,
          workflowId,
          nodeId
        };

        const existingNodeTypeMetrics = get().nodeTypeMetrics[nodeType];
        const newNodeTypeMetrics = calculateNodeTypeMetrics(
          existingNodeTypeMetrics,
          durationMs
        );

        set((state) => ({
          metrics: [...state.metrics.slice(-MAX_METRICS_ENTRIES + 1), executionMetric],
          nodeTypeMetrics: {
            ...state.nodeTypeMetrics,
            [nodeType]: {
              ...newNodeTypeMetrics,
              nodeType
            }
          }
        }));
      },

      getNodeTypeMetrics: (nodeType) => {
        return get().nodeTypeMetrics[nodeType];
      },

      getAverageDuration: (nodeType) => {
        const metrics = get().nodeTypeMetrics[nodeType];
        if (!metrics || metrics.executionCount === 0) {
          return null;
        }
        return metrics.totalDurationMs / metrics.executionCount;
      },

      getPerformanceTrend: (nodeType) => {
        const metrics = get().nodeTypeMetrics[nodeType];
        if (!metrics || metrics.executionCount < MIN_SAMPLES_FOR_TREND) {
          return null;
        }

        const averageMs = metrics.totalDurationMs / metrics.executionCount;
        const _deviation = Math.abs(metrics.lastExecutionMs - averageMs);
        const threshold = averageMs * 0.2;

        if (metrics.lastExecutionMs < averageMs - threshold) {
          return "faster";
        } else if (metrics.lastExecutionMs > averageMs + threshold) {
          return "slower";
        }
        return "normal";
      },

      clearMetrics: () => {
        set({ metrics: [], nodeTypeMetrics: {} });
      },

      clearNodeTypeMetrics: (nodeType) => {
        set((state) => {
          const { [nodeType]: _, ...remainingMetrics } = state.nodeTypeMetrics;
          return { nodeTypeMetrics: remainingMetrics };
        });
      },

      trimOldMetrics: (maxEntries) => {
        set((state) => ({
          metrics: state.metrics.slice(-maxEntries)
        }));
      }
    }),
    {
      name: "performance-metrics",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        metrics: state.metrics,
        nodeTypeMetrics: state.nodeTypeMetrics
      })
    }
  )
);

export default usePerformanceMetricsStore;
