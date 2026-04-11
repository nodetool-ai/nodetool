/**
 * Types for the mobile chain-based graph editor.
 *
 * The editor models a workflow as a linear chain of nodes,
 * similar to Zapier. Each node's selected output connects
 * to a chosen input on the next node.
 */

import type {
  Node,
  Edge,
  Workflow,
  WorkflowGraph,
  NodeMetadata,
  Property,
  OutputSlot,
  PropertyTypeMetadata,
} from "./ApiTypes";

// ── Chain node ───────────────────────────────────────────────────────

/** A single node in the vertical chain. */
export interface ChainNode {
  /** Unique instance id (UUID). */
  id: string;
  /** Fully-qualified node type, e.g. "nodetool.text.Template". */
  nodeType: string;
  /** Snapshot of the node metadata (properties, outputs, title, etc.). */
  metadata: NodeMetadata;
  /** User-configured property values keyed by property name. */
  properties: Record<string, unknown>;
  /** Which output slot feeds the *next* node in the chain. */
  selectedOutput: string;
  /**
   * Which input on *this* node receives data from the *previous* node.
   * `null` for the first node in the chain.
   */
  inputMapping: string | null;
  /** Whether the property editor is expanded. */
  expanded: boolean;
}

// ── Connection (visual + data) ───────────────────────────────────────

/** Describes the connection between two adjacent chain nodes. */
export interface ChainConnection {
  /** Source chain-node id. */
  sourceId: string;
  /** Output slot name on the source node. */
  sourceOutput: string;
  /** Target chain-node id. */
  targetId: string;
  /** Input property name on the target node. */
  targetInput: string;
}

// ── Type compatibility ───────────────────────────────────────────────

/** Checks whether two PropertyTypeMetadata are broadly compatible. */
export function areTypesCompatible(
  source: PropertyTypeMetadata,
  target: PropertyTypeMetadata
): boolean {
  // "any" is always compatible
  if (source.type === "any" || target.type === "any") return true;

  // Exact match
  if (source.type === target.type) return true;

  // Numeric widening: int -> float
  if (source.type === "int" && target.type === "float") return true;

  // Union: source is compatible if it matches any member
  if (target.type === "union" && target.type_args.length > 0) {
    return target.type_args.some((arg) => areTypesCompatible(source, arg));
  }

  // List compatibility: list[A] -> list[B] if A -> B
  if (
    source.type === "list" &&
    target.type === "list" &&
    source.type_args.length > 0 &&
    target.type_args.length > 0
  ) {
    return areTypesCompatible(source.type_args[0], target.type_args[0]);
  }

  return false;
}

/** Returns properties on `metadata` that are compatible with `outputType`. */
export function getCompatibleInputs(
  metadata: NodeMetadata,
  outputType: PropertyTypeMetadata
): Property[] {
  return metadata.properties.filter((p) =>
    areTypesCompatible(outputType, p.type)
  );
}

/** Returns the first compatible input name, or null. */
export function findBestInput(
  metadata: NodeMetadata,
  outputType: PropertyTypeMetadata
): string | null {
  const compatible = getCompatibleInputs(metadata, outputType);
  return compatible.length > 0 ? compatible[0].name : null;
}

// ── Workflow conversion ──────────────────────────────────────────────

/** Convert a chain of nodes + connections into a Workflow-compatible graph. */
export function chainToGraph(
  chain: ChainNode[],
  connections: ChainConnection[]
): WorkflowGraph {
  const nodes: Node[] = chain.map((cn, index) => ({
    id: cn.id,
    type: cn.nodeType,
    data: cn.properties,
    ui_properties: {
      position: { x: 0, y: index * 200 },
      width: 280,
    },
    sync_mode: "zip_all",
  }));

  const edges: Edge[] = connections.map((c, i) => ({
    id: `edge-${i}`,
    source: c.sourceId,
    sourceHandle: c.sourceOutput,
    target: c.targetId,
    targetHandle: c.targetInput,
  }));

  return { nodes, edges };
}

/** Build the connections array from the ordered chain. */
export function buildConnections(chain: ChainNode[]): ChainConnection[] {
  const connections: ChainConnection[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const source = chain[i];
    const target = chain[i + 1];
    if (target.inputMapping) {
      connections.push({
        sourceId: source.id,
        sourceOutput: source.selectedOutput,
        targetId: target.id,
        targetInput: target.inputMapping,
      });
    }
  }
  return connections;
}
