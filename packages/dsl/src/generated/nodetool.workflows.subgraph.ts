// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Subgraph — nodetool.workflows.subgraph.Subgraph
export type SubgraphInputs = {
  graph?: Connectable<Record<string, unknown>>;
};

export interface SubgraphOutputs {
}

export function subgraph(inputs: SubgraphInputs): DslNode<SubgraphOutputs> {
  return createNode("nodetool.workflows.subgraph.Subgraph", inputs, { outputNames: [], streaming: true });
}
