// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Embedding — mistral.embeddings.Embedding
export type EmbeddingInputs = {
  input?: Connectable<string>;
  model?: Connectable<"mistral-embed">;
  chunk_size?: Connectable<number>;
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs, options?: NodeOptions): NodeWithOutputs<EmbeddingOutputs, "output"> {
  return createNode("mistral.embeddings.Embedding", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list"}, defaultOutput: "output" });
}
