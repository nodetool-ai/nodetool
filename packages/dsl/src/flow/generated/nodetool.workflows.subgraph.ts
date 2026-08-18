// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Subgraph — nodetool.workflows.subgraph.Subgraph
export type SubgraphInputs = {
  graph?: Record<string, unknown>;
};

export interface SubgraphOutputs {
}

export function subgraph(inputs: SubgraphInputs): Promise<SubgraphOutputs> {
  return callNode<SubgraphOutputs>("nodetool.workflows.subgraph.Subgraph", inputs);
}

subgraph.stream = function (inputs: SubgraphInputs): AsyncIterable<Partial<SubgraphOutputs>> {
  return streamNode<Partial<SubgraphOutputs>>("nodetool.workflows.subgraph.Subgraph", inputs);
};
