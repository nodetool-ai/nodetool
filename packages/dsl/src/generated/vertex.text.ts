// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Grounded Search — vertex.text.GroundedSearch
export type GroundedSearchInputs = {
  query?: Connectable<string>;
  model?: Connectable<unknown>;
};

export interface GroundedSearchOutputs {
  results: string[];
  sources: unknown[];
  text: string;
}

export function groundedSearch(inputs: GroundedSearchInputs, options?: NodeOptions): NodeWithOutputs<GroundedSearchOutputs> {
  return createNode("vertex.text.GroundedSearch", inputs, { id: options?.id, outputNames: ["results", "sources", "text"], outputTypes: {"results":"list[str]","sources":"list[source]","text":"str"} });
}

// Embedding — vertex.text.Embedding
export type EmbeddingInputs = {
  input?: Connectable<string>;
  model?: Connectable<unknown>;
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs, options?: NodeOptions): NodeWithOutputs<EmbeddingOutputs, "output"> {
  return createNode("vertex.text.Embedding", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list"}, defaultOutput: "output" });
}
