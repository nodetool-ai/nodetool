import { Edge, Node } from "@xyflow/react";
import { UNSET_PROVIDER } from "@nodetool-ai/protocol";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { PROVIDER_MODEL_TYPES } from "@nodetool-ai/node-sdk/cost-estimate";

export interface MissingModelNode {
  nodeId: string;
  nodeTitle: string;
  propertyName: string;
  modelType: string;
}

/**
 * True when a model field names no model: it needs both an id and a provider
 * that is not the `"empty"` sentinel. A missing provider counts as unset —
 * `validateNodeProperties` refuses `{ id: "gpt-4" }` with `unset_model` before
 * the job row exists, so the run dies on a 400 unless this catches it first.
 */
export function isModelEmpty(value: unknown): boolean {
  if (!value) return true;
  if (typeof value !== "object") return false;
  const provider = "provider" in value ? value.provider : undefined;
  const id = "id" in value ? value.id : undefined;
  return !id || !provider || provider === UNSET_PROVIDER;
}

/**
 * Scan the graph for nodes that need a model but have none set, so we can
 * guide the user before they hit a run failure. Skips:
 * - bypassed nodes (they don't execute)
 * - model inputs fed by an edge (the value comes from upstream, not the field)
 */
export function findMissingModelNodes(
  nodes: Node<NodeData>[],
  edges: Edge[],
  getMetadata: (nodeType: string) => NodeMetadata | undefined
): MissingModelNode[] {
  const missing: MissingModelNode[] = [];

  const connectedInputs = new Set<string>();
  for (const edge of edges) {
    if (edge.target && edge.targetHandle) {
      connectedInputs.add(`${edge.target}::${edge.targetHandle}`);
    }
  }

  for (const node of nodes) {
    if (node.data?.bypassed) continue;
    if (!node.type) continue;

    const metadata = getMetadata(node.type);
    if (!metadata?.properties) continue;

    const properties = node.data?.properties ?? {};

    for (const prop of metadata.properties) {
      const modelType = prop.type?.type;
      if (!modelType || !PROVIDER_MODEL_TYPES.has(modelType)) continue;

      const isConnected = connectedInputs.has(`${node.id}::${prop.name}`);
      if (isConnected) continue;

      if (isModelEmpty(properties[prop.name])) {
        // Use the node type's canonical name (e.g. "Text To Image") rather
        // than the user's custom title — custom titles are often long
        // instructional notes that read like comments in this dialog.
        const title =
          metadata.title || node.type.split(".").pop() || node.type;
        missing.push({
          nodeId: node.id,
          nodeTitle: title,
          propertyName: prop.name,
          modelType
        });
      }
    }
  }

  return missing;
}
