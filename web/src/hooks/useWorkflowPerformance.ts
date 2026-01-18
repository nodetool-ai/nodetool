import { useMemo } from 'react';
import useExecutionTimeStore from '../stores/ExecutionTimeStore';
import useStatusStore from '../stores/StatusStore';
import { Node } from '@xyflow/react';

/**
 * Threshold in milliseconds for identifying performance bottlenecks.
 * Nodes taking longer than this are flagged as bottlenecks.
 */
const BOTTLENECK_THRESHOLD_MS = 1000;

/**
 * Performance data for a single node in the workflow.
 */
export interface NodePerformanceData {
  /** Unique identifier for the node */
  nodeId: string;
  /** Type of the node (e.g., 'llm', 'text', 'image') */
  nodeType: string | undefined;
  /** Display label for the node */
  nodeLabel: string;
  /** Execution duration in milliseconds, undefined if not executed */
  duration: number | undefined;
  /** Execution status (e.g., 'completed', 'failed', 'running') */
  status: string | undefined;
  /** Whether this node is a performance bottleneck (>1s execution) */
  isBottleneck: boolean;
  /** Percentage of total workflow time spent in this node */
  percentage: number;
}

/**
 * Aggregated performance metrics for an entire workflow.
 */
export interface WorkflowPerformanceMetrics {
  /** Total number of nodes in the workflow */
  totalNodes: number;
  /** Number of nodes that have been executed */
  executedNodes: number;
  /** Total execution time in milliseconds for all executed nodes */
  totalDuration: number;
  /** Average execution time per node in milliseconds */
  averageDuration: number;
  /** Number of nodes identified as bottlenecks */
  bottleneckCount: number;
  /** Overall performance score (0-100) based on duration and bottlenecks */
  performanceScore: number;
  /** The slowest executed node, or null if no nodes executed */
  slowestNode: NodePerformanceData | null;
  /** List of all bottleneck nodes sorted by duration descending */
  bottlenecks: NodePerformanceData[];
}

/**
 * Performance analysis hook for workflow node execution metrics.
 * 
 * Collects and analyzes execution timing data from ExecutionTimeStore
 * to provide performance insights including bottlenecks, total duration,
 * and optimization suggestions.
 * 
 * @param workflowId - The unique identifier for the workflow
 * @param nodes - Array of ReactFlow nodes in the workflow
 * @returns Performance metrics and analysis data
 * 
 * @example
 * ```typescript
 * const metrics = useWorkflowPerformance('workflow-123', nodes);
 * console.log(metrics.performanceScore); // 85
 * console.log(metrics.bottlenecks); // [{ nodeId, duration, ... }]
 * ```
 */
export const useWorkflowPerformance = (
  workflowId: string,
  nodes: Node[]
): WorkflowPerformanceMetrics => {
  const getDuration = useExecutionTimeStore(state => state.getDuration);
  const getStatus = useStatusStore(state => state.getStatus);

  const metrics = useMemo((): WorkflowPerformanceMetrics => {
    const nodeDataList: NodePerformanceData[] = nodes.map(node => {
      const duration = getDuration(workflowId, node.id);
      const status = getStatus(workflowId, node.id);
      const durationMs = duration ?? 0;
      
      return {
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: node.data.label?.toString() || node.id,
        duration,
        status: status as string | undefined,
        isBottleneck: durationMs >= BOTTLENECK_THRESHOLD_MS,
        percentage: 0
      };
    });

    const executedNodes = nodeDataList.filter(n => n.duration !== undefined);
    const totalDuration = executedNodes.reduce((sum, n) => sum + (n.duration || 0), 0);
    const bottleneckCount = executedNodes.filter(n => n.isBottleneck).length;

    nodeDataList.forEach(n => {
      n.percentage = totalDuration > 0 ? ((n.duration || 0) / totalDuration) * 100 : 0;
    });

    const sortedByDuration = [...executedNodes].sort((a, b) => (b.duration || 0) - (a.duration || 0));
    const slowestNode = sortedByDuration[0] || null;
    const bottlenecks = sortedByDuration.filter(n => n.isBottleneck);

    const executedCount = executedNodes.length;
    const averageDuration = executedCount > 0 ? totalDuration / executedCount : 0;

    const performanceScore = calculatePerformanceScore(
      executedCount,
      nodes.length,
      totalDuration,
      bottleneckCount
    );

    return {
      totalNodes: nodes.length,
      executedNodes: executedCount,
      totalDuration,
      averageDuration,
      bottleneckCount,
      performanceScore,
      slowestNode,
      bottlenecks
    };
  }, [workflowId, nodes, getDuration, getStatus]);

  return metrics;
};

const calculatePerformanceScore = (
  executedCount: number,
  totalCount: number,
  totalDuration: number,
  bottleneckCount: number
): number => {
  if (totalCount === 0) return 0;
  if (executedCount === 0) return 0;

  const executionRate = executedCount / totalCount;
  const bottleneckRatio = bottleneckCount / executedCount;
  
  let score = 100;
  
  if (totalDuration > 30000) {
    score -= 20;
  } else if (totalDuration > 10000) {
    score -= 10;
  }
  
  score -= bottleneckRatio * 30;
  
  if (executionRate < 1) {
    score -= (1 - executionRate) * 20;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
};

export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    return milliseconds > 0 ? `${seconds}s ${milliseconds}ms` : `${seconds}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

export const getPerformanceGrade = (score: number): { grade: string; color: string } => {
  if (score >= 90) {
    return { grade: 'A', color: '#4caf50' };
  }
  if (score >= 75) {
    return { grade: 'B', color: '#8bc34a' };
  }
  if (score >= 60) {
    return { grade: 'C', color: '#ffeb3b' };
  }
  if (score >= 40) {
    return { grade: 'D', color: '#ff9800' };
  }
  return { grade: 'F', color: '#f44336' };
};

export const getOptimizationSuggestions = (
  metrics: WorkflowPerformanceMetrics,
  nodes: Node[]
): string[] => {
  const suggestions: string[] = [];

  if (metrics.totalDuration > 30000) {
    suggestions.push('Consider breaking this workflow into smaller parallel stages.');
  }

  if (metrics.bottleneckCount > 0) {
    suggestions.push(`${metrics.bottleneckCount} node(s) take over 1 second. Review their configurations.`);
  }

  nodes.forEach(node => {
    const type = node.type;
    if (type?.includes('llm') || type?.includes('model')) {
      suggestions.push('LLM/Model nodes are typically the slowest. Consider caching results for repeated inputs.');
    }
    if (type?.includes('image') || type?.includes('audio')) {
      suggestions.push('Media processing nodes may benefit from reduced resolution/bitrate if quality allows.');
    }
  });

  if (suggestions.length === 0) {
    suggestions.push('Workflow appears well-optimized!');
  }

  return suggestions;
};
