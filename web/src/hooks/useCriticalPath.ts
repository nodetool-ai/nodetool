/**
 * useCriticalPath Hook
 *
 * React hook for accessing critical path analysis data.
 * Calculates and caches the critical path based on execution times.
 *
 * @experimental
 */

import { useMemo } from "react";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import {
  calculateCriticalPath,
  CriticalPathResult,
  isEdgeOnCriticalPath,
  isNodeOnCriticalPath
} from "../utils/executionCriticalPath";
import useExecutionTimeStore from "../stores/ExecutionTimeStore";

export interface UseCriticalPathResult {
  /** The critical path analysis result */
  criticalPath: CriticalPathResult | null;
  /** Check if an edge is on the critical path */
  isEdgeOnCriticalPath: (edge: Edge) => boolean;
  /** Check if a node is on the critical path */
  isNodeOnCriticalPath: (nodeId: string) => boolean;
  /** Whether critical path analysis is available */
  isAvailable: boolean;
}

/**
 * Hook for accessing critical path analysis
 *
 * @param workflowId - The workflow ID to get execution times for
 * @param nodes - All nodes in the workflow
 * @param edges - All edges in the workflow
 * @returns Critical path analysis utilities
 */
export function useCriticalPath(
  workflowId: string,
  nodes: Node<NodeData>[],
  edges: Edge[]
): UseCriticalPathResult {
  // Get all execution durations for this workflow
  const timings = useMemo(() => {
    const timingMap = new Map<string, number>();

    for (const node of nodes) {
      // We need to access the store directly
      const duration = useExecutionTimeStore.getState().getDuration(workflowId, node.id);
      if (duration !== undefined) {
        timingMap.set(node.id, duration);
      }
    }

    return timingMap;
  }, [workflowId, nodes]);

  // Calculate the critical path
  const criticalPath = useMemo<CriticalPathResult | null>(() => {
    if (timings.size === 0) {
      return null;
    }
    return calculateCriticalPath(nodes, edges, timings);
  }, [nodes, edges, timings]);

  // Memoize checker functions
  const checkEdgeOnCriticalPath = useMemo(
    () => (edge: Edge) => {
      return criticalPath ? isEdgeOnCriticalPath(edge, criticalPath) : false;
    },
    [criticalPath]
  );

  const checkNodeOnCriticalPath = useMemo(
    () => (nodeId: string) => {
      return criticalPath ? isNodeOnCriticalPath(nodeId, criticalPath) : false;
    },
    [criticalPath]
  );

  return {
    criticalPath,
    isEdgeOnCriticalPath: checkEdgeOnCriticalPath,
    isNodeOnCriticalPath: checkNodeOnCriticalPath,
    isAvailable: criticalPath !== null && criticalPath.nodeCount > 0
  };
}

export default useCriticalPath;
