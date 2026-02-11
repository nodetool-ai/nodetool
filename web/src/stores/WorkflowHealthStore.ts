/**
 * WorkflowHealthStore monitors workflow execution health and performance metrics.
 *
 * Simplified version - stores execution history and provides basic health metrics.
 * Full analytics to be added in future iteration.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Record of a single workflow execution
 */
interface ExecutionRecord {
  timestamp: number;
  duration: number;
  success: boolean;
  nodeTimings: Record<string, number>;
  errorNodeIds: string[];
}

/**
 * Aggregated statistics for a specific node across all executions
 */
interface NodeStatistics {
  nodeId: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
  totalDuration: number;
  averageDuration: number;
  maxDuration: number;
  failureRate: number;
}

/**
 * Health recommendation with actionable insights
 */
interface HealthRecommendation {
  type: "error" | "warning" | "info" | "success";
  title: string;
  description: string;
  actionable: boolean;
  affectedNodeIds?: string[];
}

/**
 * Overall workflow health metrics
 */
interface WorkflowHealth {
  workflowId: string;
  score: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  fastestExecution: number;
  slowestExecution: number;
  nodeStatistics: Record<string, NodeStatistics>;
  recommendations: HealthRecommendation[];
  lastExecutionTime: number | null;
}

/**
 * Store state interface
 */
interface WorkflowHealthState {
  healthData: Record<string, WorkflowHealth>;
  executionHistory: Record<string, ExecutionRecord[]>;
  maxHistorySize: number;
}

/**
 * Store actions interface
 */
interface WorkflowHealthActions {
  recordExecution: (
    workflowId: string,
    data: {
      duration: number;
      success: boolean;
      nodeTimings: Record<string, number>;
      errorNodeIds?: string[];
    }
  ) => void;
  getWorkflowHealth: (workflowId: string) => WorkflowHealth | undefined;
  clearHistory: (workflowId: string) => void;
  clearAllHistory: () => void;
  setMaxHistorySize: (size: number) => void;
}

type WorkflowHealthStore = WorkflowHealthState & WorkflowHealthActions;

const DEFAULT_MAX_HISTORY = 50;
const MIN_HISTORY_SIZE = 10;
const MAX_HISTORY_SIZE = 500;

/**
 * Calculate health score based on execution history (0-100)
 */
const calculateHealthScore = (workflowId: string, history: ExecutionRecord[]): number => {
  if (history.length === 0) {
    return 100;
  }

  const successCount = history.filter((r) => r.success).length;
  const successRate = successCount / history.length;
  
  let score = 100;
  
  // Deduct points for failures
  score -= (1 - successRate) * 50;
  
  // Deduct for error nodes
  const failedRuns = history.filter(r => !r.success);
  const errorNodes = new Set(failedRuns.flatMap(r => r.errorNodeIds || []));
  const errorCount = errorNodes.size;
  if (errorCount > 0 && history.length >= 3) {
    score -= Math.min(errorCount * 10, 30);
    }
  
  return Math.max(0, Math.min(100, Math.round(score)));
};

/**
 * Generate health recommendations based on workflow metrics
 */
const generateRecommendations = (
  workflowId: string,
  history: ExecutionRecord[]
): HealthRecommendation[] => {
  const recommendations: HealthRecommendation[] = [];
  
  if (history.length === 0) {
    recommendations.push({
      type: "info",
      title: "No Execution Data",
      description: "Run the workflow to see health metrics and optimization suggestions.",
      actionable: true,
    });
  } else if (history.length < 3) {
    recommendations.push({
      type: "info",
      title: "Limited Data",
      description: "Run the workflow a few more times to get accurate health metrics.",
      actionable: true,
    });
  } else {
    const successCount = history.filter((r) => r.success).length;
    const successRate = successCount / history.length;
    
    if (successRate >= 0.95) {
      recommendations.push({
        type: "success",
        title: "Excellent Reliability",
        description: "Workflow is performing very well with a high success rate.",
        actionable: false,
      });
    } else if (successRate < 0.7) {
      recommendations.push({
        type: "error",
        title: "High Failure Rate",
        description: `Workflow fails ${Math.round((1 - successRate) * 100)}% of the time. Check frequently failing nodes for issues.`,
        actionable: true,
      });
    } else if (successRate < 0.9) {
      recommendations.push({
        type: "warning",
        title: "Moderate Failure Rate",
        description: `Workflow fails ${Math.round((1 - successRate) * 100)}% of the time. Review error messages and check node configurations.`,
        actionable: true,
      });
    }
    
    // Find slow nodes
    const nodeTimings: Record<string, number[]> = {};
    for (const record of history) {
      for (const [nodeId, duration] of Object.entries(record.nodeTimings)) {
        if (!nodeTimings[nodeId]) {
          nodeTimings[nodeId] = [];
        }
        nodeTimings[nodeId].push(duration);
      }
    }
    
    // Build node timings map for analysis
    const nodeTimingsMap: Record<string, number[]> = {};
    for (const record of history) {
      for (const [nodeId, duration] of Object.entries(record.nodeTimings)) {
        if (!nodeTimingsMap[nodeId]) {
          nodeTimingsMap[nodeId] = [];
        }
        nodeTimingsMap[nodeId].push(duration);
      }
    }
    
    const slowNodes = Object.entries(nodeTimingsMap)
      .map(([nodeId, durations]) => ({
        nodeId,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      }))
      .filter((n) => n.durations.length >= 3 && n.avgDuration > 5000)
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 3);
      
    if (slowNodes.length > 0) {
      recommendations.push({
        type: "warning",
        title: "Performance Bottlenecks Detected",
        description: `${slowNodes.length} node(s) averaging more than 5 seconds. Consider optimizing or caching these operations.`,
        actionable: true,
        affectedNodeIds: slowNodes.map((n) => n.nodeId),
      });
    }
  }
  
  return recommendations;
const useWorkflowHealthStore = create<WorkflowHealthStore>()(
  persist(
    (set, get) => ({
      healthData: {},
      executionHistory: {},
      maxHistorySize: DEFAULT_MAX_HISTORY,

      recordExecution: (workflowId: string, data) => {
        const record: ExecutionRecord = {
          timestamp: Date.now(),
          duration: data.duration,
          success: data.success,
          nodeTimings: data.nodeTimings,
          errorNodeIds: data.errorNodeIds || [],
        };

        set((state) => {
          const history = state.executionHistory[workflowId] || [];
          const maxHistory = state.maxHistorySize;

          // Trim history if needed
          const newHistory =
            history.length >= maxHistory
              ? [...history.slice(-maxHistory + 1), record]
              : [...history, record];

          const updatedHistory = {
            ...state.executionHistory,
            [workflowId]: newHistory,
          };

          // Update health metrics
          const score = calculateHealthScore(workflowId, newHistory);
          const recommendations = generateRecommendations(workflowId, newHistory);
          
          // Calculate node statistics
          const nodeStats: Record<string, NodeStatistics> = {};
          for (const rec of newHistory) {
            for (const [nodeId, duration] of Object.entries(rec.nodeTimings)) {
              if (!nodeStats[nodeId]) {
                nodeStats[nodeId] = {
                  nodeId,
                  executionCount: 0,
                  successCount: 0,
                  failureCount: 0,
                  totalDuration: 0,
                  averageDuration: 0,
                  maxDuration: 0,
                  failureRate: 0,
                };
              }
              nodeStats[nodeId].executionCount++;
              nodeStats[nodeId].totalDuration += duration;
              nodeStats[nodeId].averageDuration = nodeStats[nodeId].totalDuration / nodeStats[nodeId].executionCount;
              if (duration > nodeStats[nodeId].maxDuration) {
                nodeStats[nodeId].maxDuration = duration;
              }
              const isError = rec.errorNodeIds?.includes(nodeId);
              if (isError) {
                nodeStats[nodeId].failureCount++;
              } else {
                nodeStats[nodeId].successCount++;
              }
              nodeStats[nodeId].failureRate = nodeStats[nodeId].failureCount / nodeStats[nodeId].executionCount;
            }
          }

          return {
            executionHistory: updatedHistory,
            healthData: {
              ...state.healthData,
              [workflowId]: {
                workflowId,
                totalExecutions: newHistory.length,
                successfulExecutions: newHistory.filter((r) => r.success).length,
                failedExecutions: newHistory.filter((r) => !r.success).length,
                successRate: newHistory.length > 0 ? newHistory.filter((r) => r.success).length / newHistory.length : 1,
                averageExecutionTime: newHistory.reduce((sum, r) => sum + r.duration, 0) / newHistory.length,
                fastestExecution: Math.min(...newHistory.map((r) => r.duration)),
                slowestExecution: Math.max(...newHistory.map((r) => r.duration)),
                nodeStatistics: nodeStats,
                recommendations: recommendations,
                score,
                lastExecutionTime: record.timestamp,
              },
            },
          };
        });
      },

      getWorkflowHealth: (workflowId: string) => {
        return get().healthData[workflowId];
      },

      clearHistory: (workflowId: string) => {
        set((state) => {
          const { [workflowId]: removed, ...remainingHistory } = state.executionHistory;
          const { [workflowId]: removedHealth, ...remainingHealthData } = state.healthData;
          return {
            executionHistory: remainingHistory,
            healthData: remainingHealthData,
          };
        });
      },

      clearAllHistory: () => {
        set({ executionHistory: {}, healthData: {} });
      },

      setMaxHistorySize: (size: number) => {
        set((state) => ({
          maxHistorySize: Math.max(MIN_HISTORY_SIZE, Math.min(MAX_HISTORY_SIZE, size)),
        }));
      },
    }),
    {
      name: "workflow-health-storage",
      partialize: (state) => ({
        healthData: state.healthData,
        executionHistory: state.executionHistory,
        maxHistorySize: state.maxHistorySize,
      }),
    }
  )
);

export default useWorkflowHealthStore;
export type { WorkflowHealth, NodeStatistics, HealthRecommendation };