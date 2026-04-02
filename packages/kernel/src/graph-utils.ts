/**
 * Graph utilities for node and edge operations.
 *
 * Port of src/nodetool/workflows/graph_utils.py.
 */

import type { Edge, NodeDescriptor } from "@nodetool/protocol";
import { Graph } from "./graph.js";

/**
 * Find a node by ID or throw.
 */
export function findNodeOrThrow(graph: Graph, nodeId: string): NodeDescriptor {
  const node = graph.findNode(nodeId);
  if (!node) {
    throw new Error(`Node with ID ${nodeId} does not exist`);
  }
  return node;
}

/**
 * Returns mapping of targetHandle -> source output type string.
 *
 * For each incoming edge to nodeId, looks up the source node's outputs
 * to find the type of the sourceHandle.
 */
export function getNodeInputTypes(
  graph: Graph,
  nodeId: string
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (const edge of graph.findIncomingEdges(nodeId)) {
    const sourceNode = graph.findNode(edge.source);
    if (sourceNode && sourceNode.outputs) {
      result[edge.targetHandle] = sourceNode.outputs[edge.sourceHandle];
    } else {
      result[edge.targetHandle] = undefined;
    }
  }

  return result;
}

/**
 * BFS downstream subgraph starting from (nodeId, sourceHandle).
 *
 * Returns the initial edges from nodeId/sourceHandle, plus all
 * reachable downstream nodes and edges.
 */
export function getDownstreamSubgraph(
  graph: Graph,
  nodeId: string,
  sourceHandle: string
): { initialEdges: Edge[]; nodes: NodeDescriptor[]; edges: Edge[] } {
  // Find initial edges from nodeId with matching sourceHandle
  const initialEdges = graph
    .findOutgoingEdges(nodeId)
    .filter((e) => e.sourceHandle === sourceHandle);

  const includedNodeIds = new Set<string>();
  const includedEdges: Edge[] = [];

  // Seed BFS with targets of initial edges
  const queue: string[] = [];
  for (const e of initialEdges) {
    includedEdges.push(e);
    includedNodeIds.add(e.target);
    includedNodeIds.add(e.source);
    queue.push(e.target);
  }

  // BFS over outgoing edges
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of graph.findOutgoingEdges(current)) {
      includedEdges.push(edge);
      if (!includedNodeIds.has(edge.target)) {
        includedNodeIds.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  // Collect nodes, skipping any missing
  const nodes: NodeDescriptor[] = [];
  for (const nid of includedNodeIds) {
    const node = graph.findNode(nid);
    if (node) nodes.push(node);
  }

  // Filter edges to those with both endpoints in included set
  const filteredEdges = includedEdges.filter(
    (e) => includedNodeIds.has(e.source) && includedNodeIds.has(e.target)
  );

  return { initialEdges, nodes, edges: filteredEdges };
}
