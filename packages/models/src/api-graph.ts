/**
 * API graph representation — T-META-6 / T-MSG-6.
 *
 * Simplified graph types for API transport, stripped of runtime-only fields.
 *
 * Ported from Python: src/nodetool/types/api_graph.py
 */

import type { Edge, GraphData, NodeDescriptor } from "@nodetool/protocol";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Simplified node for API serialisation (no runtime metadata). */
export interface ApiNode {
  id: string;
  parent_id?: string | null;
  type: string;
  data: Record<string, unknown>;
  ui_properties?: Record<string, unknown>;
  dynamic_properties?: Record<string, unknown>;
  dynamic_outputs?: Record<string, unknown>;
  sync_mode?: "on_any" | "zip_all";
}

/** Edge representation for API transport. */
export interface ApiEdge {
  id?: string | null;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  ui_properties?: Record<string, string> | null;
  edge_type?: "data" | "control";
}

/** Complete graph for API transport. */
export interface ApiGraph {
  nodes: ApiNode[];
  edges: ApiEdge[];
}

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

/**
 * Convert a kernel-level NodeDescriptor to an ApiNode.
 *
 * Strips runtime-only fields (is_streaming_input, is_streaming_output,
 * sync_mode, is_controlled, is_dynamic, outputs) and maps `properties`
 * to the `data` field.
 */
export function toApiNode(node: NodeDescriptor): ApiNode {
  return {
    id: node.id,
    parent_id: node.parent_id ?? null,
    type: node.type,
    data: (node.properties as Record<string, unknown>) ?? {},
    ui_properties: node.ui_properties ?? {},
    dynamic_properties: node.dynamic_properties ?? {},
    dynamic_outputs: (node.dynamic_outputs as Record<string, unknown>) ?? {},
    sync_mode: node.sync_mode ?? "on_any"
  };
}

/**
 * Convert a protocol Edge to an ApiEdge.
 */
export function toApiEdge(edge: Edge): ApiEdge {
  return {
    id: edge.id ?? null,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    ui_properties: edge.ui_properties ?? null,
    edge_type: edge.edge_type ?? "data"
  };
}

/**
 * Convert a full GraphData to an ApiGraph, stripping runtime-only fields.
 */
export function toApiGraph(graph: GraphData): ApiGraph {
  return {
    nodes: graph.nodes.map(toApiNode),
    edges: graph.edges.map(toApiEdge)
  };
}

// ---------------------------------------------------------------------------
// Utility: remove connected slots
// ---------------------------------------------------------------------------

/**
 * Clear data slots on nodes that have incoming edges (the edge provides the
 * value at runtime, so the static default should be removed).
 *
 * Mirrors Python's `remove_connected_slots`.
 */
export function removeConnectedSlots(graph: ApiGraph): ApiGraph {
  // Build a map: nodeId -> set of targetHandle names with incoming edges
  const incoming = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    let handles = incoming.get(edge.target);
    if (!handles) {
      handles = new Set();
      incoming.set(edge.target, handles);
    }
    handles.add(edge.targetHandle);
  }

  const nodes = graph.nodes.map((node) => {
    const handles = incoming.get(node.id);
    if (!handles) return node;

    const data = { ...node.data };
    for (const slot of handles) {
      delete data[slot];
    }
    return { ...node, data };
  });

  return { nodes, edges: graph.edges };
}
