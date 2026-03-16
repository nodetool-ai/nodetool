// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

// Grounded Search — gemini.text.GroundedSearch
export interface GroundedSearchInputs {
  query?: Connectable<string>;
  model?: Connectable<unknown>;
}

export interface GroundedSearchOutputs {
  results: OutputHandle<string[]>;
  sources: OutputHandle<unknown[]>;
}

export function groundedSearch(inputs: GroundedSearchInputs): DslNode<GroundedSearchOutputs> {
  return createNode("gemini.text.GroundedSearch", inputs as Record<string, unknown>, { multiOutput: true });
}

// Embedding — gemini.text.Embedding
export interface EmbeddingInputs {
  input?: Connectable<string>;
  model?: Connectable<unknown>;
}

export function embedding(inputs: EmbeddingInputs): DslNode<SingleOutput<unknown>> {
  return createNode("gemini.text.Embedding", inputs as Record<string, unknown>);
}
