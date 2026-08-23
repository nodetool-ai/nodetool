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
} from "../../stores/ApiTypes";
import type { TypeMetadata } from "../../stores/ApiTypes";
import type { Node, Edge } from "../../stores/ApiTypes";
import { isConnectable } from "../../utils/TypeHandler";

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

export interface ChainNode {
  id: string;
  nodeType: string;
  metadata: NodeMetadata;
  properties: Record<string, unknown>;
  selectedOutput: string;
  /** Maps input property names → source node + output. */
  inputMappings: InputMappings;
  expanded: boolean;
}

export interface ChainConnection {
  sourceId: string;
  sourceOutput: string;
  targetId: string;
  targetInput: string;
}

/**
 * Whether a source output can feed a target input.
 *
 * Delegates to the graph editor's rule so the chain editor accepts exactly
 * what dragging an edge on the canvas accepts (str → enum, T → list[T],
 * unions, dicts, cv ↔ chunk), plus int → float, which is safe to widen and
 * which the canvas rule leaves out.
 */
export function areTypesCompatible(
  source: TypeMetadata,
  target: TypeMetadata
): boolean {
  if (isConnectable(source, target)) return true;
  // int widens to float, including inside a union or list target.
  if (source.type === "int") {
    return isConnectable({ ...source, type: "float" }, target);
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

/**
 * Rank a candidate input for an auto-connection.
 * Higher wins; ties fall back to declaration order.
 */
function inputScore(prop: Property, outputName: string, outputType: TypeMetadata): number {
  let score = 0;
  if (prop.type.type === outputType.type) score += 4;
  if (prop.name === outputName) score += 3;
  if (prop.type.type === "any") score -= 2;
  return score;
}

export function findBestInput(
  metadata: NodeMetadata,
  outputType: TypeMetadata,
  outputName = ""
): string | null {
  const compatible = getCompatibleInputs(metadata, outputType);
  if (compatible.length === 0) return null;
  let best = compatible[0];
  let bestScore = inputScore(best, outputName, outputType);
  for (const prop of compatible.slice(1)) {
    const score = inputScore(prop, outputName, outputType);
    if (score > bestScore) {
      best = prop;
      bestScore = score;
    }
  }
  return best.name;
}

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

/**
 * Pick the input mappings a newly inserted node should start with.
 *
 * Walks backwards from the insertion point and takes the first earlier node
 * that produces something this node can accept — its selected output first,
 * then its other outputs. Returns an empty map when nothing matches.
 */
export function autoMapInputs(
  metadata: NodeMetadata,
  chain: ChainNode[],
  index: number
): InputMappings {
  for (let i = Math.min(index, chain.length) - 1; i >= 0; i--) {
    const prev = chain[i];
    const outputs = [...prev.metadata.outputs].sort((a, b) => {
      const aSel = a.name === prev.selectedOutput ? 0 : 1;
      const bSel = b.name === prev.selectedOutput ? 0 : 1;
      return aSel - bSel;
    });
    for (const output of outputs) {
      const input = findBestInput(metadata, output.type, output.name);
      if (input) {
        return {
          [input]: { sourceNodeId: prev.id, sourceOutput: output.name },
        };
      }
    }
  }
  return {};
}
