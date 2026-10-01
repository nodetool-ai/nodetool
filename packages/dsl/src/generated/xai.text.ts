// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Chat Complete — xai.text.ChatComplete
export type ChatCompleteInputs = {
  model?: Connectable<string>;
  prompt?: Connectable<string>;
  system_prompt?: Connectable<string>;
  temperature?: Connectable<number>;
  max_tokens?: Connectable<number>;
};

export interface ChatCompleteOutputs {
  output: string;
}

export function chatComplete(inputs: ChatCompleteInputs, options?: NodeOptions): NodeWithOutputs<ChatCompleteOutputs, "output"> {
  return createNode("xai.text.ChatComplete", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}

// Web Search — xai.text.WebSearch
export type WebSearchInputs = {
  model?: Connectable<string>;
  query?: Connectable<string>;
  search_mode?: Connectable<"auto" | "on" | "off">;
  max_results?: Connectable<number>;
};

export interface WebSearchOutputs {
  output: string;
  citations: string[];
}

export function webSearch(inputs: WebSearchInputs, options?: NodeOptions): NodeWithOutputs<WebSearchOutputs> {
  return createNode("xai.text.WebSearch", inputs, { id: options?.id, outputNames: ["output", "citations"], outputTypes: {"output":"str","citations":"list[str]"} });
}
