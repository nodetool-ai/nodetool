/**
 * Node-property bindings let a write widget (slider, switch, text input…)
 * drive any property of any graph node — not just dedicated Input nodes.
 *
 * `@nodetool-ai/app-runtime` owns the binding-string encoding, so a node
 * property travels through the Puck document, the runtime store and event
 * dispatch exactly like an input name. These helpers overlay the resulting
 * live values onto the graph before a run.
 */
import { Node as RFNode } from "@xyflow/react";
import { parseInputStateKey } from "@nodetool-ai/app-runtime";

import { NodeData } from "../../stores/NodeData";

/**
 * Group the live values of node-property bindings by node id, from the input
 * namespace of an app instance: nodeId → { property: value }.
 */
export const collectNodePropertyOverlays = (
  inputs: Record<string, { value: unknown }>
): Map<string, Record<string, unknown>> => {
  const byNode = new Map<string, Record<string, unknown>>();
  for (const [key, slot] of Object.entries(inputs)) {
    if (slot.value === undefined) continue;
    const parsed = parseInputStateKey(key);
    if (!parsed?.property) continue;
    const existing = byNode.get(parsed.nodeId);
    if (existing) {
      existing[parsed.property] = slot.value;
    } else {
      byNode.set(parsed.nodeId, { [parsed.property]: slot.value });
    }
  }
  return byNode;
};

/** Overlay live property values onto a ReactFlow node's data.properties. */
export const withNodeProperties = (
  node: RFNode<NodeData>,
  overlay: Record<string, unknown>
): RFNode<NodeData> => ({
  ...node,
  data: {
    ...node.data,
    properties: { ...(node.data?.properties ?? {}), ...overlay }
  }
});
