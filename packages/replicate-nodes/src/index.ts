import type { NodeClass } from "@nodetool/node-sdk";
import { NodeRegistry } from "@nodetool/node-sdk";

export const REPLICATE_NODES: readonly NodeClass[] = [];

export function registerReplicateNodes(registry: NodeRegistry): void {
  for (const nodeClass of REPLICATE_NODES) {
    registry.register(nodeClass);
  }
}
