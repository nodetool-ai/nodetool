// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Grounded Search — gemini.text.GroundedSearch
export type GroundedSearchInputs = {
  query?: Connectable<string>;
  model?: Connectable<"gemini-3.5-flash" | "gemini-3.1-pro-preview" | "gemini-3.1-flash-lite" | "gemini-2.5-pro" | "gemini-2.5-flash" | "gemini-2.5-flash-lite">;
};

export interface GroundedSearchOutputs {
  results: string[];
  sources: unknown[];
  text: string;
}

export function groundedSearch(inputs: GroundedSearchInputs, options?: NodeOptions): NodeWithOutputs<GroundedSearchOutputs> {
  return createNode("gemini.text.GroundedSearch", inputs, { id: options?.id, outputNames: ["results", "sources", "text"], outputTypes: {"results":"list[str]","sources":"list[source]","text":"str"} });
}

// Embedding — gemini.text.Embedding
export type EmbeddingInputs = {
  input?: Connectable<string>;
  model?: Connectable<"gemini-embedding-2">;
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs, options?: NodeOptions): NodeWithOutputs<EmbeddingOutputs, "output"> {
  return createNode("gemini.text.Embedding", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list"}, defaultOutput: "output" });
}
