// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Embedding — mistral.embeddings.Embedding
export interface EmbeddingInputs {
  input?: Connectable<string>;
  model?: Connectable<unknown>;
  chunk_size?: Connectable<number>;
}

export function embedding(inputs: EmbeddingInputs): DslNode<SingleOutput<unknown>> {
  return createNode("mistral.embeddings.Embedding", inputs as Record<string, unknown>);
}
