/**
 * Types for the web chain-based graph editor.
 *
 * The editor models a workflow as a linear chain of nodes.
 * Each input on a node can be wired to any *previous* node's output,
 * not just the immediately preceding one.
 */

import type {
  NodeMetadata,
  Property,
  OutputSlot,
} from "../../stores/ApiTypes";
import type { TypeMetadata } from "../../stores/ApiTypes";
import type { Node, Edge, Workflow } from "../../stores/ApiTypes";

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

export interface ChainNode {
  id: string;
  nodeType: string;
  metadata: NodeMetadata;
  properties: Record<string, unknown>;
  selectedOutput: string;
  /**
   * Maps input property names → source node + output.
   * Replaces the old single `inputMapping` field.
   */
  inputMappings: InputMappings;
  expanded: boolean;
}

export interface ChainConnection {
  sourceId: string;
  sourceOutput: string;
  targetId: string;
  targetInput: string;
}

// ── Type compatibility ───────────────────────────────────────────────

export function areTypesCompatible(
  source: TypeMetadata,
  target: TypeMetadata
): boolean {
  if (source.type === "any" || target.type === "any") return true;
  if (source.type === target.type) return true;
  if (source.type === "int" && target.type === "float") return true;
  if (target.type === "union" && target.type_args.length > 0) {
    return target.type_args.some((arg) => areTypesCompatible(source, arg));
  }
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

export function getCompatibleInputs(
  metadata: NodeMetadata,
  outputType: TypeMetadata
): Property[] {
  return metadata.properties.filter((p) =>
    areTypesCompatible(outputType, p.type)
  );
}

export function findBestInput(
  metadata: NodeMetadata,
  outputType: TypeMetadata
): string | null {
  const compatible = getCompatibleInputs(metadata, outputType);
  return compatible.length > 0 ? compatible[0].name : null;
}

// ── Workflow conversion ──────────────────────────────────────────────

export interface WorkflowGraph {
  nodes: Node[];
  edges: Edge[];
}

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
