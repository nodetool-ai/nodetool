/**
 * @nodetool/protocol – Graph Types
 *
 * TypeScript equivalents of graph structures from:
 *   src/nodetool/types/api_graph.py (Edge)
 *   src/nodetool/workflows/graph.py (Graph)
 *   src/nodetool/workflows/control_events.py
 */

import type { EdgeType } from "./messages.js";
import type { TypeMetadata } from "./type-metadata.js";

// ---------------------------------------------------------------------------
// Edge
// ---------------------------------------------------------------------------

export interface Edge {
  id?: string | null;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  ui_properties?: Record<string, string> | null;
  edge_type?: EdgeType;
  [key: string]: unknown;
}

export function isControlEdge(edge: Edge): boolean {
  return edge.edge_type === "control";
}

export function isDataEdge(edge: Edge): boolean {
  return edge.edge_type !== "control";
}

// ---------------------------------------------------------------------------
// Control Events
// ---------------------------------------------------------------------------

export interface RunEvent {
  event_type: "run";
  properties: Record<string, unknown>;
}

export interface StopEvent {
  event_type: "stop";
}

export type ControlEvent = RunEvent | StopEvent;

// ---------------------------------------------------------------------------
// Node descriptor (minimal shape for the kernel layer)
// ---------------------------------------------------------------------------

export type SyncMode = "on_any" | "zip_all";

/**
 * Minimal node descriptor for graph operations.
 * The full BaseNode equivalent lives in the node-sdk package.
 */
export interface NodeDescriptor {
  id: string;
  type: string;
  name?: string;

  /** Declared input property names and their types. */
  properties?: Record<string, unknown>;

  /** Declared output slot names and their types. */
  outputs?: Record<string, string>;

  /** Parent node ID for sub-graph nodes. */
  parent_id?: string | null;

  /** UI-only metadata carried through graph transport. */
  ui_properties?: Record<string, unknown>;

  /** Dynamic runtime properties accepted by dynamic nodes. */
  dynamic_properties?: Record<string, unknown>;

  /** Dynamic runtime outputs declared by dynamic nodes. */
  dynamic_outputs?: Record<string, TypeMetadata | Record<string, unknown>>;

  /** Whether this node consumes streaming input. */
  is_streaming_input?: boolean;

  /** Whether this node produces streaming output. */
  is_streaming_output?: boolean;

  /** Sync mode: fire-on-first or wait-all. */
  sync_mode?: SyncMode;

  /** Whether this node is controlled via control edges. */
  is_controlled?: boolean;

  /** Whether this node is dynamic (runtime outputs). */
  is_dynamic?: boolean;

  /** Property type strings keyed by property name (e.g. { values: "list[int]" }). */
  propertyTypes?: Record<string, string>;

  /** Per-property metadata (description, min, max) for control context enrichment. */
  propertyMeta?: Record<
    string,
    { description?: string; min?: number; max?: number }
  >;
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export interface GraphData {
  nodes: NodeDescriptor[];
  edges: Edge[];
}
