import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { TEXT_EXTRA_NODES } from "./nodes/text-extra.js";
import { LIB_SVG_NODES } from "./nodes/lib-svg.js";

export * from "./nodes/text-extra.js";
export * from "./nodes/lib-svg.js";

export const ALL_TEXT_NODES: readonly NodeClass[] = [
  ...TEXT_EXTRA_NODES,
  ...LIB_SVG_NODES,
];

export function registerTextNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_TEXT_NODES) {
    registry.register(nodeClass);
  }
}
