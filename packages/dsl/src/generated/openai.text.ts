// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Embedding — openai.text.Embedding
export interface EmbeddingInputs {
  input?: Connectable<string>;
  model?: Connectable<"text-embedding-3-large" | "text-embedding-3-small">;
  chunk_size?: Connectable<number>;
}

export interface EmbeddingOutputs {
  output: unknown[];
}

export function embedding(inputs: EmbeddingInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<EmbeddingOutputs, "output"> {
  return createNode("openai.text.Embedding", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Web Search — openai.text.WebSearch
export interface WebSearchInputs {
  query?: Connectable<string>;
}

export interface WebSearchOutputs {
  output: string;
}

export function webSearch(inputs: WebSearchInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<WebSearchOutputs, "output"> {
  return createNode("openai.text.WebSearch", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Moderation — openai.text.Moderation
export interface ModerationInputs {
  input?: Connectable<string>;
  model?: Connectable<"omni-moderation-latest" | "omni-moderation-2024-09-26" | "text-moderation-latest" | "text-moderation-stable">;
}

export interface ModerationOutputs {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}

export function moderation(inputs: ModerationInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ModerationOutputs> {
  return createNode("openai.text.Moderation", inputs as Record<string, unknown>, { outputNames: ["flagged", "categories", "category_scores"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
