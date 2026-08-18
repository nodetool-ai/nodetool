// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Embedding — openai.text.Embedding
export type EmbeddingInputs = {
  input?: string;
  model?: "text-embedding-3-large" | "text-embedding-3-small";
  chunk_size?: number;
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs): Promise<EmbeddingOutputs> {
  return callNode<EmbeddingOutputs>("openai.text.Embedding", inputs);
}

// Web Search — openai.text.WebSearch
export type WebSearchInputs = {
  query?: string;
};

export interface WebSearchOutputs {
  output: string;
}

export function webSearch(inputs: WebSearchInputs): Promise<WebSearchOutputs> {
  return callNode<WebSearchOutputs>("openai.text.WebSearch", inputs);
}

// Moderation — openai.text.Moderation
export type ModerationInputs = {
  input?: string;
  model?: "omni-moderation-latest" | "omni-moderation-2024-09-26" | "text-moderation-latest" | "text-moderation-stable";
};

export interface ModerationOutputs {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}

export function moderation(inputs: ModerationInputs): Promise<ModerationOutputs> {
  return callNode<ModerationOutputs>("openai.text.Moderation", inputs);
}
