/**
 * Graph utilities for node and edge operations.
 *
 * Port of src/nodetool/workflows/graph_utils.py.
 */

import type { Edge, GraphData, NodeDescriptor } from "@nodetool/protocol";
import { isControlEdge, TypeMetadata } from "@nodetool/protocol";
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

// ---------------------------------------------------------------------------
// Bypass rewriting
// ---------------------------------------------------------------------------

/**
 * Returns true if a node is marked as bypassed via ui_properties.bypassed.
 */
export function isNodeBypassed(node: NodeDescriptor): boolean {
  const ui = node.ui_properties;
  if (!ui || typeof ui !== "object") return false;
  return (ui as Record<string, unknown>).bypassed === true;
}

/**
 * Look up the declared type string of a node's output handle.
 */
function getOutputTypeString(
  node: NodeDescriptor | undefined,
  handle: string
): string | undefined {
  if (!node) return undefined;
  return node.outputs?.[handle];
}

/**
 * Look up the declared type string of a node's input (property) handle.
 *
 * Checks propertyTypes first (the authoritative map after graph load),
 * then falls back to the property value's `type` field for backwards
 * compatibility with raw graph payloads.
 */
function getInputTypeString(
  node: NodeDescriptor | undefined,
  handle: string
): string | undefined {
  if (!node) return undefined;
  const fromPropertyTypes = node.propertyTypes?.[handle];
  if (fromPropertyTypes) return fromPropertyTypes;
  const props = node.properties as Record<string, unknown> | undefined;
  if (props) {
    const val = props[handle];
    if (typeof val === "object" && val !== null && "type" in val) {
      const t = (val as { type: unknown }).type;
      if (typeof t === "string") return t;
    } else if (typeof val === "string") {
      return val;
    }
  }
  return undefined;
}

/**
 * Return true when two type strings are compatible according to
 * TypeMetadata rules. Missing type info on either side is treated as
 * compatible ("any") so that bypass still works on dynamic nodes where
 * handle types are not statically declared.
 */
function typesCompatible(
  sourceType: string | undefined,
  targetType: string | undefined
): boolean {
  if (!sourceType || !targetType) return true;
  try {
    const s = TypeMetadata.fromString(sourceType);
    const t = TypeMetadata.fromString(targetType);
    return s.isCompatibleWith(t);
  } catch {
    return true;
  }
}

/**
 * Rewrite a graph to route around nodes marked with
 * `ui_properties.bypassed === true`.
 *
 * For each bypassed node and each of its outgoing data edges, we look for
 * an incoming data edge whose source output type is compatible with the
 * outgoing edge's target input type. If one is found, a new edge is
 * created directly from the upstream source to the downstream target,
 * preserving the downstream handle and any edge metadata (id, ui_properties,
 * edge_type). Outgoing edges with no type-compatible input are dropped.
 *
 * When multiple incoming edges would match an outgoing edge, preference is
 * given to an incoming edge whose targetHandle matches the outgoing edge's
 * sourceHandle (name match), falling back to the first type-compatible one.
 *
 * Chained bypassed nodes (A → B(bypassed) → C(bypassed) → D) are handled
 * by iterating until no further bypassed node can be rewritten — each
 * iteration replaces bypassed sources with their already-resolved upstream
 * source so that a chain collapses into a direct edge from the first
 * non-bypassed source to the first non-bypassed target.
 *
 * Control edges (edge_type === "control") touching a bypassed node are
 * dropped: bypassing intentionally removes the node from execution, so
 * control connections to/from it no longer have a meaningful target.
 */
export function rewriteBypassedNodes(data: GraphData): GraphData {
  const bypassedIds = new Set(
    data.nodes.filter(isNodeBypassed).map((n) => n.id)
  );
  if (bypassedIds.size === 0) {
    return data;
  }

  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  let currentEdges: Edge[] = [...data.edges];
  const processed = new Set<string>();

  // Iterate: process bypassed nodes whose bypassed predecessors have all
  // already been resolved. This guarantees a chain collapses in source→
  // target order.
  let didChange = true;
  while (didChange) {
    didChange = false;

    for (const bypassId of bypassedIds) {
      if (processed.has(bypassId)) continue;

      const incoming = currentEdges.filter((e) => e.target === bypassId);
      const hasUnprocessedBypassedUpstream = incoming.some(
        (e) => bypassedIds.has(e.source) && !processed.has(e.source)
      );
      if (hasUnprocessedBypassedUpstream) continue;

      const incomingData = incoming.filter((e) => !isControlEdge(e));
      const outgoing = currentEdges.filter((e) => e.source === bypassId);
      const outgoingData = outgoing.filter((e) => !isControlEdge(e));

      const reroutedEdges: Edge[] = [];
      for (const outEdge of outgoingData) {
        const bypassNode = nodeById.get(bypassId);
        const bypassOutputType = getOutputTypeString(
          bypassNode,
          outEdge.sourceHandle
        );
        const targetNode = nodeById.get(outEdge.target);
        const targetInputType = getInputTypeString(
          targetNode,
          outEdge.targetHandle
        );

        // Prefer an incoming edge whose target handle matches the
        // outgoing source handle (name-based pairing), then fall back to
        // the first incoming edge whose source output type is compatible
        // with the downstream target's input type.
        const candidatesCompatibleWithDownstream: Edge[] = [];
        const candidatesCompatibleWithBypassOutput: Edge[] = [];
        for (const inEdge of incomingData) {
          const sourceNode = nodeById.get(inEdge.source);
          const sourceOutputType = getOutputTypeString(
            sourceNode,
            inEdge.sourceHandle
          );
          if (!typesCompatible(sourceOutputType, targetInputType)) continue;

          candidatesCompatibleWithDownstream.push(inEdge);
          if (typesCompatible(sourceOutputType, bypassOutputType)) {
            candidatesCompatibleWithBypassOutput.push(inEdge);
          }
        }

        const preferredCandidates =
          candidatesCompatibleWithBypassOutput.length > 0
            ? candidatesCompatibleWithBypassOutput
            : candidatesCompatibleWithDownstream;

        const candidates: Edge[] = [];
        for (const candidate of preferredCandidates) {
          if (candidate.targetHandle === outEdge.sourceHandle) {
            candidates.unshift(candidate);
          } else {
            candidates.push(candidate);
          }
        }

        const matched = candidates[0];
        if (!matched) continue;

        reroutedEdges.push({
          ...outEdge,
          source: matched.source,
          sourceHandle: matched.sourceHandle
        });
      }

      // Drop all edges touching the bypassed node and append the rerouted
      // ones.  Control edges attached to the bypassed node are dropped
      // here — bypassing removes the node from execution entirely.
      currentEdges = currentEdges.filter(
        (e) => e.source !== bypassId && e.target !== bypassId
      );
      currentEdges.push(...reroutedEdges);

      processed.add(bypassId);
      didChange = true;
    }
  }

  // Remove bypassed nodes themselves from the node list.
  const remainingNodes = data.nodes.filter((n) => !bypassedIds.has(n.id));

  return { nodes: remainingNodes, edges: currentEdges };
}
