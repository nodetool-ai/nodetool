import type { Node } from "@xyflow/react";
import type { NodeData } from "../stores/NodeData";
import type { NodeMetadata } from "../stores/ApiTypes";

/**
 * A node is "heavy" when executing it hits a provider/API/model rather than
 * doing a cheap local transform. We classify purely from node metadata:
 *
 *  - `required_settings`  — declares API keys/settings → a cloud provider call.
 *  - `recommended_models` — runs a model (local or remote).
 *  - `auto_save_asset`    — a generative node (image/audio/video/…).
 *
 * Constants, string/math ops, routing, and other local nodes match none of
 * these and are ignored, so the large-run warning only counts the nodes that
 * could actually overload a provider/API.
 */
function isHeavyNode(metadata: NodeMetadata | undefined): boolean {
  if (!metadata) {
    return false;
  }
  return (
    (metadata.required_settings?.length ?? 0) > 0 ||
    (metadata.recommended_models?.length ?? 0) > 0 ||
    metadata.auto_save_asset === true
  );
}

/**
 * Count the heavy nodes a full workflow run would execute — the non-bypassed
 * nodes whose metadata marks them as provider/model/API nodes.
 */
export function countHeavyNodes(
  nodes: Node<NodeData>[],
  getMetadata: (nodeType: string) => NodeMetadata | undefined
): number {
  return nodes.reduce((count, node) => {
    if (node.data?.bypassed) {
      return count;
    }
    return isHeavyNode(getMetadata(node.type ?? "")) ? count + 1 : count;
  }, 0);
}
