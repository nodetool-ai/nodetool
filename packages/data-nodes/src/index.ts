import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { DATA_NODES } from "./nodes/data.js";
import { LIB_SEABORN_NODES } from "./nodes/lib-charts.js";

export * from "./nodes/data.js";
export * from "./nodes/lib-charts.js";

export const ALL_DATA_NODES: readonly NodeClass[] = [
  ...DATA_NODES,
  ...LIB_SEABORN_NODES,
];

export function registerDataNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_DATA_NODES) {
    registry.register(nodeClass);
  }
}
