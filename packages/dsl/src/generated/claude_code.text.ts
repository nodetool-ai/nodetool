// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Web Search — claude_code.text.WebSearch
export type WebSearchInputs = {
  query?: Connectable<string>;
  model?: Connectable<unknown>;
};

export interface WebSearchOutputs {
  text: string;
  sources: unknown[];
}

export function webSearch(inputs: WebSearchInputs, options?: NodeOptions): NodeWithOutputs<WebSearchOutputs> {
  return createNode("claude_code.text.WebSearch", inputs, { id: options?.id, outputNames: ["text", "sources"], outputTypes: {"text":"str","sources":"list"} });
}
