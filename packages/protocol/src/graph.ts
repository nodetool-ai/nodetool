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

  /**
   * Emit output_update for this node's handles even when they have outgoing
   * data edges. The runner suppresses output_update for connected handles by
   * default (downstream receives the value on the edge; clients display only
   * terminal handles). Nodes whose output_updates feed a UI surface
   * regardless of patching — e.g. the realtime audio monitor — set this.
   */
  always_emit_output_updates?: boolean;

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

/**
 * A node descriptor whose behavior-critical flags have been resolved — the
 * kernel trusts these flags to pick the execution mode (streaming run() vs
 * one-shot process(), controlled mode, join semantics), so a runner must
 * never receive a descriptor where they are merely absent. Produced by the
 * hydration helpers (`Graph.loadFromDict`, node-sdk's `hydrateGraphNodeFlags`,
 * kernel's `withExplicitNodeFlags`); raw wire graphs (`NodeDescriptor`) are
 * deliberately not assignable.
 */
export interface HydratedNodeDescriptor extends NodeDescriptor {
  is_streaming_input: boolean;
  is_streaming_output: boolean;
  is_controlled: boolean;
  is_join_node: boolean;
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export interface GraphData {
  nodes: NodeDescriptor[];
  edges: Edge[];
}

/** GraphData whose nodes carry resolved behavior flags. See {@link HydratedNodeDescriptor}. */
export interface HydratedGraphData {
  nodes: HydratedNodeDescriptor[];
  edges: Edge[];
}

// ---------------------------------------------------------------------------
// Backward-compat node-type migrations
// ---------------------------------------------------------------------------

/** A removed node type and the replacement it is rewritten to on load. */
export interface NodeTypeMigration {
  /** Deprecated node_type to match. */
  from: string;
  /** Replacement node_type. */
  to: string;
  /**
   * Static property (and connection handle) renames, old name -> new name.
   * Applied to the node's `data`/`properties` and to any incoming edge whose
   * `targetHandle` matches an old name.
   */
  renameProperties?: Record<string, string>;
}

/**
 * Node types removed in favor of a replacement. Old workflows keep loading
 * because {@link migrateGraphNodeTypes} rewrites these on every graph load
 * (server-side in `Graph.fromDict`, client-side when a workflow enters the
 * editor store).
 */
export const NODE_TYPE_MIGRATIONS: readonly NodeTypeMigration[] = [
  // FormatText was identical to Prompt apart from its input field name.
  {
    from: "nodetool.text.FormatText",
    to: "nodetool.text.Prompt",
    renameProperties: { template: "prompt" }
  }
];

const MIGRATION_BY_FROM: ReadonlyMap<string, NodeTypeMigration> = new Map(
  NODE_TYPE_MIGRATIONS.map((m) => [m.from, m])
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return a renamed copy of `container`, or undefined if nothing changed. */
function renameKeys(
  container: unknown,
  renames: Record<string, string>
): Record<string, unknown> | undefined {
  if (!isPlainObject(container)) return undefined;
  let next: Record<string, unknown> | undefined;
  for (const [from, to] of Object.entries(renames)) {
    if (from in container && !(to in container)) {
      next ??= { ...container };
      next[to] = next[from];
      delete next[from];
    }
  }
  return next;
}

/** A raw workflow graph shape loose enough for migration before validation. */
export interface MigratableGraph {
  nodes?: unknown;
  edges?: unknown;
}

/**
 * Rewrite removed node types in a raw workflow graph to their replacements
 * (see {@link NODE_TYPE_MIGRATIONS}). Pure and non-mutating: returns the same
 * reference when nothing matched, otherwise a shallow copy with only the
 * changed nodes, edges, and their `data`/`properties` cloned. Cheap enough to
 * call on every load.
 */
export function migrateGraphNodeTypes<T extends MigratableGraph>(graph: T): T {
  if (!isPlainObject(graph) || !Array.isArray(graph.nodes)) return graph;

  const handleRenamesByNodeId = new Map<string, Record<string, string>>();
  let changed = false;

  const nodes = graph.nodes.map((node) => {
    if (!isPlainObject(node) || typeof node.type !== "string") return node;
    const migration = MIGRATION_BY_FROM.get(node.type);
    if (!migration) return node;
    changed = true;
    const next: Record<string, unknown> = { ...node, type: migration.to };
    if (migration.renameProperties) {
      const renamedData = renameKeys(next.data, migration.renameProperties);
      if (renamedData) next.data = renamedData;
      const renamedProps = renameKeys(next.properties, migration.renameProperties);
      if (renamedProps) next.properties = renamedProps;
      if (typeof next.id === "string") {
        handleRenamesByNodeId.set(next.id, migration.renameProperties);
      }
    }
    return next;
  });

  if (!changed) return graph;

  let edges = graph.edges;
  if (handleRenamesByNodeId.size > 0 && Array.isArray(edges)) {
    edges = edges.map((edge) => {
      if (!isPlainObject(edge) || typeof edge.target !== "string") return edge;
      const renames = handleRenamesByNodeId.get(edge.target);
      if (
        renames &&
        typeof edge.targetHandle === "string" &&
        edge.targetHandle in renames
      ) {
        return { ...edge, targetHandle: renames[edge.targetHandle] };
      }
      return edge;
    });
  }

  return { ...graph, nodes, edges } as T;
}
