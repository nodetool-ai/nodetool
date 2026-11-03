// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Grounded Search — vertex.text.GroundedSearch
export type GroundedSearchInputs = {
  query?: string;
  model?: unknown;
};

export interface GroundedSearchOutputs {
  results: string[];
  sources: unknown[];
  text: string;
}

export function groundedSearch(inputs: GroundedSearchInputs): Promise<GroundedSearchOutputs> {
  return callNode<GroundedSearchOutputs>("vertex.text.GroundedSearch", inputs);
}

// Embedding — vertex.text.Embedding
export type EmbeddingInputs = {
  input?: string;
  model?: unknown;
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs): Promise<EmbeddingOutputs> {
  return callNode<EmbeddingOutputs>("vertex.text.Embedding", inputs);
}
