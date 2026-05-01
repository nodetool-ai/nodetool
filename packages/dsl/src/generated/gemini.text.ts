// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Grounded Search — gemini.text.GroundedSearch
export interface GroundedSearchInputs {
  query?: Connectable<string>;
  model?: Connectable<"gemini-3.1-pro-preview" | "gemini-3.1-flash-image-preview" | "gemini-3-pro-image-preview" | "gemini-3-flash-preview" | "gemini-2.5-pro" | "gemini-2.5-flash" | "gemini-2.5-flash-lite" | "gemini-2.0-flash">;
}

export interface GroundedSearchOutputs {
  results: string[];
  sources: unknown[];
  text: string;
}

export function groundedSearch(inputs: GroundedSearchInputs): DslNode<GroundedSearchOutputs> {
  return createNode("gemini.text.GroundedSearch", inputs as Record<string, unknown>, { outputNames: ["results", "sources", "text"] });
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
