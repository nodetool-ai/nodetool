// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

// Embedding — openai.text.Embedding
export interface EmbeddingInputs {
  input?: Connectable<string>;
  model?: Connectable<unknown>;
  chunk_size?: Connectable<number>;
}

export function embedding(inputs: EmbeddingInputs): DslNode<SingleOutput<unknown>> {
  return createNode("openai.text.Embedding", inputs as Record<string, unknown>);
}

// Web Search — openai.text.WebSearch
export interface WebSearchInputs {
  query?: Connectable<string>;
}

export function webSearch(inputs: WebSearchInputs): DslNode<SingleOutput<string>> {
  return createNode("openai.text.WebSearch", inputs as Record<string, unknown>);
}

// Moderation — openai.text.Moderation
export interface ModerationInputs {
  input?: Connectable<string>;
  model?: Connectable<unknown>;
}

export interface ModerationOutputs {
  flagged: OutputHandle<boolean>;
  categories: OutputHandle<Record<string, boolean>>;
  category_scores: OutputHandle<Record<string, number>>;
}

export function moderation(inputs: ModerationInputs): DslNode<ModerationOutputs> {
  return createNode("openai.text.Moderation", inputs as Record<string, unknown>, { multiOutput: true });
}
