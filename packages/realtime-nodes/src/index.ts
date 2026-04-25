import type { NodeClass, NodeRegistry } from "@nodetool/node-sdk";

export const REALTIME_NODES: readonly NodeClass[] = [];

export function registerRealtimeNodes(registry: NodeRegistry): void {
  for (const nodeClass of REALTIME_NODES) {
    registry.register(nodeClass);
  }
}
