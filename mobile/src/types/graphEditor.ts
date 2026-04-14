/**
 * Types for the mobile chain-based graph editor.
 *
 * The editor models a workflow as a linear chain of nodes.
 * Each input on a node can be wired to any *previous* node's output,
 * not just the immediately preceding one.
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

// ── Input source mapping ─────────────────────────────────────────────

/** Describes where a single input gets its data from. */
export interface InputSource {
  /** The chain node id of the source. */
  sourceNodeId: string;
  /** Which output slot on the source node. */
  sourceOutput: string;
}

/**
 * Maps input property names to their source.
 * Keys are input property names on *this* node.
 * An empty record means no inputs are wired.
 */
export type InputMappings = Record<string, InputSource>;

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
  /** Which output slot feeds downstream nodes by default. */
  selectedOutput: string;
  /**
   * Maps input property names → source node + output.
   * Replaces the old single `inputMapping` field.
   */
  inputMappings: InputMappings;
  /** Whether the property editor is expanded. */
  expanded: boolean;
}

// ── Connection (visual + data) ───────────────────────────────────────

/** Describes a connection between any two chain nodes. */
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
    edge_type: "data" as const,
  }));

  return { nodes, edges };
}

/** Build the connections array from the ordered chain's inputMappings. */
export function buildConnections(chain: ChainNode[]): ChainConnection[] {
  const connections: ChainConnection[] = [];
  for (const node of chain) {
    for (const [inputName, source] of Object.entries(node.inputMappings)) {
      connections.push({
        sourceId: source.sourceNodeId,
        sourceOutput: source.sourceOutput,
        targetId: node.id,
        targetInput: inputName,
      });
    }
  }
  return connections;
}
