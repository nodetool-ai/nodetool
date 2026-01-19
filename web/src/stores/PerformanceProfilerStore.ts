/**
 * Workflow Performance Profiler Store
 *
 * Tracks comprehensive performance metrics for workflow execution including:
 * - Execution timing (extends ExecutionTimeStore)
 * - Node resource estimates (memory, I/O, compute)
 * - Bottleneck detection
 * - Performance scoring
 *
 * This is a research feature for analyzing workflow performance.
 *
 * @example
 * ```typescript
 * import usePerformanceProfilerStore from './PerformanceProfilerStore';
 *
 * const store = usePerformanceProfilerStore();
 * store.recordNodeStart('workflow-1', 'node-1', 'LLM', 'My Node', { x: 0, y: 0 });
 * store.recordNodeComplete('workflow-1', 'node-1', { ioWaitMs: 100 });
 * const report = store.generateReport('workflow-1', {});
 * console.log('Bottlenecks:', report.bottlenecks);
 * ```
 */
import { create } from "zustand";

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  duration: number;
  startTime: number;
  memoryEstimateMB: number;
  computeEstimate: number;
  ioWaitMs: number;
  status: "pending" | "running" | "completed" | "error";
  position: { x: number; y: number };
}

export interface PerformanceBottleneck {
  nodeId: string;
  nodeName: string;
  severity: "high" | "medium" | "low";
  type: "memory" | "compute" | "io" | "sequential";
  description: string;
  suggestion: string;
}

export interface ParallelizationOpportunity {
  nodeId: string;
  nodeName: string;
  suggestion: string;
}

export interface WorkflowPerformanceReport {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  errorCount: number;
  metrics: NodePerformanceMetrics[];
  bottlenecks: PerformanceBottleneck[];
  score: number;
  parallelizationOpportunities: ParallelizationOpportunity[];
}

interface NodePerformanceData {
  startTime: number;
  endTime?: number;
  memoryEstimateMB: number;
  computeEstimate: number;
  ioWaitMs: number;
  status: "pending" | "running" | "completed" | "error";
  nodeType: string;
  nodeName: string;
  position: { x: number; y: number };
}

interface PerformanceProfilerStore {
  nodeMetrics: Record<string, NodePerformanceData>;
  recordNodeStart: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    nodeName: string,
    position: { x: number; y: number },
    options?: { memoryEstimateMB?: number; computeEstimate?: number }
  ) => void;
  recordNodeComplete: (
    workflowId: string,
    nodeId: string,
    options?: { ioWaitMs?: number; memoryEstimateMB?: number }
  ) => void;
  recordNodeError: (workflowId: string, nodeId: string) => void;
  getNodeMetrics: (
    workflowId: string,
    nodeId: string
  ) => NodePerformanceData | undefined;
  getAllMetrics: (workflowId: string) => NodePerformanceData[];
  generateReport: (workflowId: string, nodeTypes: Record<string, { memoryMB?: number; compute?: number }>) => WorkflowPerformanceReport;
  clearMetrics: (workflowId: string) => void;
}

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const NODE_TYPE_DEFAULTS: Record<string, { memoryMB: number; compute: number }> = {
  LLM: { memoryMB: 2048, compute: 80 },
  ImageGeneration: { memoryMB: 4096, compute: 95 },
  AudioProcessing: { memoryMB: 1024, compute: 60 },
  TextProcessing: { memoryMB: 512, compute: 30 },
  VectorStore: { memoryMB: 1536, compute: 40 },
  Function: { memoryMB: 256, compute: 20 },
  Input: { memoryMB: 128, compute: 5 },
  Output: { memoryMB: 128, compute: 5 },
  Condition: { memoryMB: 64, compute: 3 },
  Loop: { memoryMB: 256, compute: 25 },
  Default: { memoryMB: 256, compute: 20 }
};

const usePerformanceProfilerStore = create<PerformanceProfilerStore>((set, get) => ({
  nodeMetrics: {},

  recordNodeStart: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    nodeName: string,
    position: { x: number; y: number },
    options?: { memoryEstimateMB?: number; computeEstimate?: number }
  ) => {
    const key = hashKey(workflowId, nodeId);
    const defaults = NODE_TYPE_DEFAULTS[nodeType] || NODE_TYPE_DEFAULTS.Default;

    set({
      nodeMetrics: {
        ...get().nodeMetrics,
        [key]: {
          startTime: Date.now(),
          memoryEstimateMB: options?.memoryEstimateMB ?? defaults.memoryMB,
          computeEstimate: options?.computeEstimate ?? defaults.compute,
          ioWaitMs: 0,
          status: "running",
          nodeType,
          nodeName,
          position
        }
      }
    });
  },

  recordNodeComplete: (
    workflowId: string,
    nodeId: string,
    options?: { ioWaitMs?: number; memoryEstimateMB?: number }
  ) => {
    const key = hashKey(workflowId, nodeId);
    const existing = get().nodeMetrics[key];
    if (existing) {
      set({
        nodeMetrics: {
          ...get().nodeMetrics,
          [key]: {
            ...existing,
            endTime: Date.now(),
            ioWaitMs: options?.ioWaitMs ?? existing.ioWaitMs,
            memoryEstimateMB: options?.memoryEstimateMB ?? existing.memoryEstimateMB,
            status: "completed"
          }
        }
      });
    }
  },

  recordNodeError: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    const existing = get().nodeMetrics[key];
    if (existing) {
      set({
        nodeMetrics: {
          ...get().nodeMetrics,
          [key]: {
            ...existing,
            endTime: Date.now(),
            status: "error"
          }
        }
      });
    }
  },

  getNodeMetrics: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    return get().nodeMetrics[key];
  },

  getAllMetrics: (workflowId: string) => {
    const metrics: NodePerformanceData[] = [];
    const allMetrics = get().nodeMetrics;
    for (const key in allMetrics) {
      if (key.startsWith(workflowId)) {
        metrics.push(allMetrics[key]);
      }
    }
    return metrics;
  },

  generateReport: (
    workflowId: string,
    _nodeTypes: Record<string, { memoryMB?: number; compute?: number }>
  ): WorkflowPerformanceReport => {
    const allMetrics = get().nodeMetrics;
    const metrics: NodePerformanceMetrics[] = [];
    let totalDuration = 0;
    let completedCount = 0;
    let errorCount = 0;

    for (const key in allMetrics) {
      if (key.startsWith(workflowId)) {
        const data = allMetrics[key];
        const duration = data.endTime
          ? data.endTime - data.startTime
          : Date.now() - data.startTime;

        if (data.status === "completed") {
          completedCount++;
          totalDuration += duration;
        } else if (data.status === "error") {
          errorCount++;
        }

        metrics.push({
          nodeId: key.replace(`${workflowId}:`, ""),
          nodeType: data.nodeType,
          nodeName: data.nodeName,
          duration,
          startTime: data.startTime,
          memoryEstimateMB: data.memoryEstimateMB,
          computeEstimate: data.computeEstimate,
          ioWaitMs: data.ioWaitMs,
          status: data.status,
          position: data.position
        });
      }
    }

    const bottlenecks = generateBottlenecks(metrics);
    const parallelizationOpportunities = findParallelizationOpportunities(metrics);
    const score = calculatePerformanceScore(metrics, bottlenecks);

    return {
      workflowId,
      totalDuration,
      nodeCount: metrics.length,
      completedCount,
      errorCount,
      metrics,
      bottlenecks,
      score,
      parallelizationOpportunities
    };
  },

  clearMetrics: (workflowId: string) => {
    const metrics = get().nodeMetrics;
    const newMetrics: Record<string, NodePerformanceData> = {};
    for (const key in metrics) {
      if (!key.startsWith(workflowId)) {
        newMetrics[key] = metrics[key];
      }
    }
    set({ nodeMetrics: newMetrics });
  }
}));

function generateBottlenecks(
  metrics: NodePerformanceMetrics[]
): PerformanceBottleneck[] {
  const bottlenecks: PerformanceBottleneck[] = [];

  if (metrics.length === 0) {return bottlenecks;}

  const durations = metrics.map((m) => m.duration);
  const maxDuration = Math.max(...durations);

  for (const metric of metrics) {
    if (metric.duration > maxDuration * 0.5 && metric.duration > 1000) {
      bottlenecks.push({
        nodeId: metric.nodeId,
        nodeName: metric.nodeName,
        severity: metric.duration > maxDuration * 0.7 ? "high" : "medium",
        type: metric.ioWaitMs > metric.duration * 0.3 ? "io" : "compute",
        description: `Node "${metric.nodeName}" took ${(metric.duration / 1000).toFixed(2)}s (${((metric.duration / maxDuration) * 100).toFixed(0)}% of total)`,
        suggestion: metric.ioWaitMs > metric.duration * 0.3
          ? "Consider optimizing I/O operations or using faster storage"
          : "This is a compute-intensive node. Consider using a more efficient model or splitting the work"
      });
    }

    if (metric.memoryEstimateMB > 2048) {
      bottlenecks.push({
        nodeId: metric.nodeId,
        nodeName: metric.nodeName,
        severity: metric.memoryEstimateMB > 4096 ? "high" : "medium",
        type: "memory",
        description: `High memory usage: ${metric.memoryEstimateMB}MB`,
        suggestion: "Consider using a smaller model or processing data in batches"
      });
    }
  }

  return bottlenecks.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

function findParallelizationOpportunities(
  metrics: NodePerformanceMetrics[]
): ParallelizationOpportunity[] {
  const opportunities: ParallelizationOpportunity[] = [];

  for (const metric of metrics) {
    if (metric.duration > 2000 && metric.computeEstimate > 50) {
      opportunities.push({
        nodeId: metric.nodeId,
        nodeName: metric.nodeName,
        suggestion: `Node "${metric.nodeName}" runs for ${(metric.duration / 1000).toFixed(1)}s. Consider if this can be split into parallel tasks.`
      });
    }
  }

  return opportunities;
}

function calculatePerformanceScore(
  metrics: NodePerformanceMetrics[],
  bottlenecks: PerformanceBottleneck[]
): number {
  if (metrics.length === 0) {return 100;}

  let score = 100;

  for (const bottleneck of bottlenecks) {
    if (bottleneck.severity === "high") {
      score -= 20;
    } else if (bottleneck.severity === "medium") {
      score -= 10;
    } else {
      score -= 5;
    }
  }

  const errors = metrics.filter((m) => m.status === "error").length;
  score -= errors * 15;

  return Math.max(0, Math.min(100, score));
}

export default usePerformanceProfilerStore;
