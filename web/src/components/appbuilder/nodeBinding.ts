/**
 * Node-property bindings let a write widget (slider, switch, text input…)
 * drive any property of any graph node — not just dedicated Input nodes.
 *
 * The binding is encoded into the widget's `binding` string as
 * `node:<nodeId>#<property>` so it travels through the Puck document, the
 * runtime store and event dispatch exactly like an input-name binding.
 */
import { Node as RFNode } from "@xyflow/react";

import { NodeData } from "../../stores/NodeData";

export const NODE_BINDING_PREFIX = "node:";

export interface NodePropertyBinding {
  nodeId: string;
  property: string;
}

export const makeNodePropertyBinding = (
  nodeId: string,
  property: string
): string => `${NODE_BINDING_PREFIX}${nodeId}#${property}`;

export const isNodePropertyBinding = (binding?: string | null): boolean =>
  typeof binding === "string" && binding.startsWith(NODE_BINDING_PREFIX);

export const parseNodePropertyBinding = (
  binding?: string | null
): NodePropertyBinding | null => {
  if (!binding || !binding.startsWith(NODE_BINDING_PREFIX)) return null;
  const rest = binding.slice(NODE_BINDING_PREFIX.length);
  const sep = rest.lastIndexOf("#");
  if (sep <= 0 || sep === rest.length - 1) return null;
  return { nodeId: rest.slice(0, sep), property: rest.slice(sep + 1) };
};

/** Group live node-binding values by node id: nodeId → { property: value }. */
export const collectNodePropertyOverlays = (
  values: Record<string, unknown>
): Map<string, Record<string, unknown>> => {
  const byNode = new Map<string, Record<string, unknown>>();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const parsed = parseNodePropertyBinding(key);
    if (!parsed) continue;
    const existing = byNode.get(parsed.nodeId);
    if (existing) {
      existing[parsed.property] = value;
    } else {
      byNode.set(parsed.nodeId, { [parsed.property]: value });
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
