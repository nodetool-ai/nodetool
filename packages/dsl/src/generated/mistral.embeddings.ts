// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Embedding — mistral.embeddings.Embedding
export interface EmbeddingInputs {
  input?: Connectable<string>;
  model?: Connectable<unknown>;
  chunk_size?: Connectable<number>;
}

export interface EmbeddingOutputs {
  output: unknown;
}

export function embedding(
  inputs: EmbeddingInputs
): DslNode<EmbeddingOutputs, "output"> {
  return createNode(
    "mistral.embeddings.Embedding",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
