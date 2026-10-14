import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { CodeNode } from "./nodes/code-node.js";

export * from "./nodes/code-node.js";

export const ALL_CODE_NODES: readonly NodeClass[] = [
  CodeNode,
];

export function registerCodeNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_CODE_NODES) {
    registry.register(nodeClass);
  }
}
