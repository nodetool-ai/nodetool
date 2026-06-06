/**
 * @nodetool-ai/protocol – Graph Types
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

export type InputMode = "buffered" | "stream" | "controlled";

export type OutputKind =
  | "single"
  | "iteration"
  | "chunk"
  | "forward"
  | "aggregate";

export type CollapseSpec = "innermost";

export interface OutputCorrelation {
  kind: OutputKind;
  source: string;
  group?: string;
  collapse?: CollapseSpec;
}

/**
 * One correlation token per iteration root in a message's lineage.
 *
 * See docs/correlation-design.md §2.
 */
export interface CorrelationToken {
  index: number;
}

/**
 * Map from iteration-root id to its current token.
 *
 * Empty for source-node and constant outputs. Iteration nodes add one entry
 * per minted root. Lineage is preserved by `forward` outputs, extended by
 * `iteration` outputs, and trimmed by `aggregate` outputs.
 */
export type CorrelationLineage = Readonly<Record<string, CorrelationToken>>;

export const EMPTY_LINEAGE: CorrelationLineage = Object.freeze({});

/**
 * Control-plane signal emitted by a source edge announcing that it will not
 * produce a value for `lineage` on `output`. Correlated joins waiting for that
 * key learn the key is unavailable before source EOS. See §6.
 */
export interface LineageDone {
  type: "lineage_done";
  source_edge_id: string;
  output: string;
  lineage: CorrelationLineage;
}

/**
 * Control-plane signal emitted by a source edge announcing that no more
 * descendant tokens of `closed_root` will arrive under `parent_lineage`. Sent
 * even when no child token was minted. See §6.
 */
export interface LineageScopeClosed {
  type: "lineage_scope_closed";
  source_edge_id: string;
  output: string;
  parent_lineage: CorrelationLineage;
  closed_root: string;
}

/** Any of the correlation control-plane signals. */
export type LineageControlSignal = LineageDone | LineageScopeClosed;

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

  /** Correlation-aware input execution mode. */
  input_mode?: InputMode;

  /** Per-output correlation metadata. */
  output_correlation?: Record<string, OutputCorrelation>;

  /** Whether this node is controlled via control edges. */
  is_controlled?: boolean;

  /** Whether this node accepts user-named dynamic input properties. */
  supports_dynamic_inputs?: boolean;

  /**
   * If true, this node is an explicit join (`Zip` or `Cross`) and is allowed
   * to receive inputs whose scopes are pairwise incomparable. Static
   * correlation analysis emits the joined output at
   * `commonParentPrefix + [iterationRoot]`. §7.
   */
  is_join_node?: boolean;

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
