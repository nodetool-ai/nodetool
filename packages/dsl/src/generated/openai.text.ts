// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Embedding — openai.text.Embedding
export type EmbeddingInputs = {
  input?: Connectable<string>;
  model?: Connectable<"text-embedding-3-large" | "text-embedding-3-small">;
  chunk_size?: Connectable<number>;
};

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs, options?: NodeOptions): NodeWithOutputs<EmbeddingOutputs, "output"> {
  return createNode("openai.text.Embedding", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list"}, defaultOutput: "output" });
}

// Web Search — openai.text.WebSearch
export type WebSearchInputs = {
  query?: Connectable<string>;
};

export interface WebSearchOutputs {
  output: string;
}

export function webSearch(inputs: WebSearchInputs, options?: NodeOptions): NodeWithOutputs<WebSearchOutputs, "output"> {
  return createNode("openai.text.WebSearch", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
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

export function moderation(inputs: ModerationInputs, options?: NodeOptions): NodeWithOutputs<ModerationOutputs> {
  return createNode("openai.text.Moderation", inputs, { id: options?.id, outputNames: ["flagged", "categories", "category_scores"], outputTypes: {"flagged":"bool","categories":"dict[str, bool]","category_scores":"dict[str, float]"} });
}
