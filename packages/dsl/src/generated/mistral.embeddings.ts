// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Embedding — mistral.embeddings.Embedding
export type EmbeddingInputs = {
  input?: Connectable<string>;
  model?: Connectable<"mistral-embed">;
  chunk_size?: Connectable<number>;
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs): DslNode<EmbeddingOutputs, "output"> {
  return createNode("mistral.embeddings.Embedding", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
