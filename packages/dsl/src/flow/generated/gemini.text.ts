// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Grounded Search — gemini.text.GroundedSearch
export type GroundedSearchInputs = {
  query?: string;
  model?: "gemini-3.5-flash" | "gemini-3.1-pro-preview" | "gemini-3.1-flash-lite" | "gemini-2.5-pro" | "gemini-2.5-flash" | "gemini-2.5-flash-lite";
};

export interface GroundedSearchOutputs {
  results: string[];
  sources: unknown[];
  text: string;
}

export function groundedSearch(inputs: GroundedSearchInputs): Promise<GroundedSearchOutputs> {
  return callNode<GroundedSearchOutputs>("gemini.text.GroundedSearch", inputs);
}

// Embedding — gemini.text.Embedding
export type EmbeddingInputs = {
  input?: string;
  model?: "gemini-embedding-2";
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs): Promise<EmbeddingOutputs> {
  return callNode<EmbeddingOutputs>("gemini.text.Embedding", inputs);
}
