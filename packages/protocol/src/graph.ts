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
  metadata?: EdgeMetadata;
  ui_properties?: Record<string, string> | null;
  edge_type?: EdgeType;
  [key: string]: unknown;
}

export type InputBufferOverflowPolicy =
  | "block"
  | "drop_oldest"
  | "drop_newest";

export interface InputBufferPolicy {
  capacity?: number | null;
  overflowPolicy?: InputBufferOverflowPolicy;
}

export interface EdgeMetadata extends InputBufferPolicy {}

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

export interface RealtimeNodeProfile {
  /** Node can run in an operator browser/electron renderer control loop. */
  browser_capable?: boolean;

  /** Node requires a browser-provided media frame to produce useful output. */
  requires_browser_frame?: boolean;

  /** Node requires WebGPU instead of a generic browser runtime. */
  requires_webgpu?: boolean;

  /** Node may emit analysis events for downstream controls. */
  emits_analysis_event?: boolean;

  /** Node may emit realtime parameter updates for another model/control node. */
  emits_parameter_update?: boolean;

  /** Node may emit media frames directly into the realtime stream. */
  emits_media_frame?: boolean;
}

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

  /** Whether this node can execute inside a realtime session. */
  is_realtime_capable?: boolean;

  /** Whether this node owns warm session state that persists across ticks. */
  owns_warm_state?: boolean;

  /** Whether this node originates or terminates a media transport. */
  is_media_adapter?: boolean;

  /** Opt-in browser/JS realtime inference capabilities. */
  realtime_profile?: RealtimeNodeProfile;

  /** Optional per-input-handle buffer policies used by realtime-capable runners. */
  inputBufferPolicy?: Record<string, InputBufferPolicy>;

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
