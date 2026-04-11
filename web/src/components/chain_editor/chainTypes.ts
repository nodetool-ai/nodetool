/**
 * Types for the web chain-based graph editor.
 *
 * The editor models a workflow as a linear chain of nodes,
 * similar to Zapier. Each node's selected output connects
 * to a chosen input on the next node.
 */

import type {
  NodeMetadata,
  Property,
  OutputSlot,
} from "../../stores/ApiTypes";
import type { TypeMetadata } from "../../stores/ApiTypes";
import type { Node, Edge, Workflow } from "../../stores/ApiTypes";

// ── Chain node ───────────────────────────────────────────────────────

export interface ChainNode {
  id: string;
  nodeType: string;
  metadata: NodeMetadata;
  properties: Record<string, unknown>;
  selectedOutput: string;
  inputMapping: string | null;
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
