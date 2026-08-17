// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Embedding — mistral.embeddings.Embedding
export type EmbeddingInputs = {
  input?: string;
  model?: "mistral-embed";
  chunk_size?: number;
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs): Promise<EmbeddingOutputs> {
  return callNode<EmbeddingOutputs>("mistral.embeddings.Embedding", inputs);
}
