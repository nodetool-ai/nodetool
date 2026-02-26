/**
 * Execution Critical Path Analysis
 *
 * Calculates the critical path (longest execution chain) in a workflow.
 * The critical path determines the minimum possible execution time and
 * helps identify performance bottlenecks.
 *
 * @experimental
 */

import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

/**
 * Timing information for a single node
 */
export interface NodeTiming {
  nodeId: string;
  duration: number;
}

/**
 * Critical path result containing all nodes and edges on the critical path
 */
export interface CriticalPathResult {
  /** Set of node IDs on the critical path */
  nodeIds: Set<string>;
  /** Set of edge IDs (source:target format) on the critical path */
  edgeIds: Set<string>;
  /** Total duration of the critical path in milliseconds */
  totalDuration: number;
  /** Number of nodes on the critical path */
  nodeCount: number;
}

/**
 * Calculate the execution critical path for a workflow.
 *
 * Uses dynamic programming to find the longest path through the DAG
 * where edge weights are the execution times of source nodes.
 *
 * @param nodes - All nodes in the workflow
 * @param edges - All edges in the workflow
 * @param timings - Map of nodeId to execution duration in milliseconds
 * @returns Critical path analysis result
 */
export function calculateCriticalPath(
  nodes: Node<NodeData>[],
  edges: Edge[],
  timings: Map<string, number>
): CriticalPathResult {
  // Filter to only nodes with timing data
  const timedNodes = nodes.filter(n => timings.has(n.id));

  if (timedNodes.length === 0) {
    return {
      nodeIds: new Set(),
      edgeIds: new Set(),
      totalDuration: 0,
      nodeCount: 0
    };
  }

  // Build adjacency lists for the graph
  const incomingEdges = new Map<string, string[]>();
  const outgoingEdges = new Map<string, string[]>();

  for (const node of timedNodes) {
    incomingEdges.set(node.id, []);
    outgoingEdges.set(node.id, []);
  }

  for (const edge of edges) {
    const sourceHasTiming = timings.has(edge.source);
    const targetHasTiming = timings.has(edge.target);

    if (sourceHasTiming && targetHasTiming) {
      incomingEdges.get(edge.target)?.push(edge.source);
      outgoingEdges.get(edge.source)?.push(edge.target);
    }
  }

  // Use memoization to find longest path to each node
  const memo = new Map<string, { duration: number; path: string[] }>();

  function findLongestPathTo(nodeId: string): { duration: number; path: string[] } {
    if (memo.has(nodeId)) {
      return memo.get(nodeId)!;
    }

    const predecessors = incomingEdges.get(nodeId) || [];
    const nodeDuration = timings.get(nodeId) || 0;

    if (predecessors.length === 0) {
      const result = { duration: nodeDuration, path: [nodeId] };
      memo.set(nodeId, result);
      return result;
    }

    let bestPredecessor: { duration: number; path: string[] } | null = null;

    for (const pred of predecessors) {
      if (!timings.has(pred)) {
        continue;
      }

      const predPath = findLongestPathTo(pred);
      if (!bestPredecessor || predPath.duration > bestPredecessor.duration) {
        bestPredecessor = predPath;
      }
    }

    const result: { duration: number; path: string[] } = bestPredecessor
      ? {
          duration: bestPredecessor.duration + nodeDuration,
          path: [...bestPredecessor.path, nodeId]
        }
      : { duration: nodeDuration, path: [nodeId] };

    memo.set(nodeId, result);
    return result;
  }

  // Find the overall longest path
  let bestPath: { duration: number; path: string[] } = { duration: 0, path: [] };

  for (const node of timedNodes) {
    const pathResult = findLongestPathTo(node.id);
    if (pathResult.duration > bestPath.duration) {
      bestPath = pathResult;
    }
  }

  // Build the result sets
  const nodeIds = new Set(bestPath.path);
  const edgeIds = new Set<string>();

  for (let i = 0; i < bestPath.path.length - 1; i++) {
    const source = bestPath.path[i];
    const target = bestPath.path[i + 1];
    edgeIds.add(`${source}:${target}`);
  }

  return {
    nodeIds,
    edgeIds,
    totalDuration: bestPath.duration,
    nodeCount: bestPath.path.length
  };
}

/**
 * Format a duration in milliseconds to a human-readable string
 */
export function formatCriticalPathDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  return remainderSeconds > 0
    ? `${minutes}m ${remainderSeconds}s`
    : `${minutes}m`;
}

/**
 * Check if an edge is on the critical path
 */
export function isEdgeOnCriticalPath(
  edge: Edge,
  criticalPath: CriticalPathResult
): boolean {
  return criticalPath.edgeIds.has(`${edge.source}:${edge.target}`);
}

/**
 * Check if a node is on the critical path
 */
export function isNodeOnCriticalPath(
  nodeId: string,
  criticalPath: CriticalPathResult
): boolean {
  return criticalPath.nodeIds.has(nodeId);
}
