// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Grounded Search — gemini.text.GroundedSearch
export interface GroundedSearchInputs {
  query?: Connectable<string>;
  model?: Connectable<unknown>;
}

export interface GroundedSearchOutputs {
  results: string[];
  sources: unknown[];
}

export function groundedSearch(
  inputs: GroundedSearchInputs
): DslNode<GroundedSearchOutputs> {
  return createNode(
    "gemini.text.GroundedSearch",
    inputs as Record<string, unknown>,
    { outputNames: ["results", "sources"] }
  );
}

// Embedding — gemini.text.Embedding
export interface EmbeddingInputs {
  input?: Connectable<string>;
  model?: Connectable<unknown>;
}

export interface EmbeddingOutputs {
  output: unknown;
}

export function embedding(
  inputs: EmbeddingInputs
): DslNode<EmbeddingOutputs, "output"> {
  return createNode(
    "gemini.text.Embedding",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
