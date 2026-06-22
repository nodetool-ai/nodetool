import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";

/**
 * Provider-backed model property types. A node with one of these set to an
 * empty value can't run without a provider + model — the backend rejects it
 * with "Please specify a provider". These are the same types that
 * {@link applyDefaultModels} fills in. Local/HF model types (llama_model,
 * hf.*, tjs.*) are intentionally excluded: they aren't provider-keyed and
 * have a different empty-state story.
 */
const PROVIDER_MODEL_TYPES = new Set([
  "language_model",
  "image_model",
  "embedding_model",
  "tts_model",
  "asr_model",
  "video_model"
]);

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
