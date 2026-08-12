// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Embedding — openai.text.Embedding
export type EmbeddingInputs = {
  input?: Connectable<string>;
  model?: Connectable<"text-embedding-3-large" | "text-embedding-3-small">;
  chunk_size?: Connectable<number>;
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs): DslNode<EmbeddingOutputs, "output"> {
  return createNode("openai.text.Embedding", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Web Search — openai.text.WebSearch
export type WebSearchInputs = {
  query?: Connectable<string>;
};

export interface WebSearchOutputs {
  output: string;
}

export function webSearch(inputs: WebSearchInputs): DslNode<WebSearchOutputs, "output"> {
  return createNode("openai.text.WebSearch", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Moderation — openai.text.Moderation
export type ModerationInputs = {
  input?: Connectable<string>;
  model?: Connectable<"omni-moderation-latest" | "omni-moderation-2024-09-26" | "text-moderation-latest" | "text-moderation-stable">;
};

export interface ModerationOutputs {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}

export function moderation(inputs: ModerationInputs): DslNode<ModerationOutputs> {
  return createNode("openai.text.Moderation", inputs, { outputNames: ["flagged", "categories", "category_scores"] });
}
