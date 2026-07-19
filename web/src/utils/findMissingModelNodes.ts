import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { PROVIDER_MODEL_TYPES } from "./aiModelNodes";

export interface MissingModelNode {
  nodeId: string;
  nodeTitle: string;
  propertyName: string;
  modelType: string;
}

export function isModelEmpty(value: unknown): boolean {
  if (!value) return true;
  if (typeof value !== "object") return false;
  const hasId = "id" in value && !!value.id;
  const provider = "provider" in value ? value.provider : undefined;
  return !hasId || provider === "empty" || provider === "";
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

  for (const node of nodes) {
    if (node.data?.bypassed) continue;
    if (!node.type) continue;

    const metadata = getMetadata(node.type);
    if (!metadata?.properties) continue;

    const properties = node.data?.properties ?? {};

    for (const prop of metadata.properties) {
      const modelType = prop.type?.type;
      if (!modelType || !PROVIDER_MODEL_TYPES.has(modelType)) continue;

      const isConnected = edges.some(
        (edge) => edge.target === node.id && edge.targetHandle === prop.name
      );
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
