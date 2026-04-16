// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Grounded Search — gemini.text.GroundedSearch
export interface GroundedSearchInputs {
  query?: Connectable<string>;
  model?: Connectable<"gemini-2.5-pro" | "gemini-2.5-flash" | "gemini-2.0-flash">;
}

export interface GroundedSearchOutputs {
  results: string[];
  sources: unknown[];
}

export function groundedSearch(inputs: GroundedSearchInputs): DslNode<GroundedSearchOutputs> {
  return createNode("gemini.text.GroundedSearch", inputs as Record<string, unknown>, { outputNames: ["results", "sources"] });
}

// Embedding — gemini.text.Embedding
export interface EmbeddingInputs {
  input?: Connectable<string>;
  model?: Connectable<"text-embedding-004" | "gemini-embedding-001">;
}

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs): DslNode<EmbeddingOutputs, "output"> {
  return createNode("gemini.text.Embedding", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
