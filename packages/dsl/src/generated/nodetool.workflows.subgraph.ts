// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Subgraph — nodetool.workflows.subgraph.Subgraph
export type SubgraphInputs = {
  graph?: Connectable<Record<string, unknown>>;
  [name: string]: unknown;
};

export interface SubgraphOutputs {
}

export function subgraph(inputs: SubgraphInputs, options?: NodeOptions): NodeWithOutputs<SubgraphOutputs> {
  return createNode("nodetool.workflows.subgraph.Subgraph", inputs, { id: options?.id, outputNames: [], outputTypes: {}, streaming: true, inputMode: "buffered", outputCorrelation: {"output":{"kind":"single","source":"__execution__"}} });
}
