// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Embedding — openai.text.Embedding
export interface EmbeddingInputs {
  input?: Connectable<string>;
  model?: Connectable<unknown>;
  chunk_size?: Connectable<number>;
}

export interface EmbeddingOutputs {
  output: unknown;
}

export function embedding(
  inputs: EmbeddingInputs
): DslNode<EmbeddingOutputs, "output"> {
  return createNode(
    "openai.text.Embedding",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Web Search — openai.text.WebSearch
export interface WebSearchInputs {
  query?: Connectable<string>;
}

export interface WebSearchOutputs {
  output: string;
}

export function webSearch(
  inputs: WebSearchInputs
): DslNode<WebSearchOutputs, "output"> {
  return createNode(
    "openai.text.WebSearch",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Moderation — openai.text.Moderation
export interface ModerationInputs {
  input?: Connectable<string>;
  model?: Connectable<unknown>;
}

export interface ModerationOutputs {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}

export function moderation(
  inputs: ModerationInputs
): DslNode<ModerationOutputs> {
  return createNode(
    "openai.text.Moderation",
    inputs as Record<string, unknown>,
    { outputNames: ["flagged", "categories", "category_scores"] }
  );
}
