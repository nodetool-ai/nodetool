// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Chat Complete — xai.text.ChatComplete
export type ChatCompleteInputs = {
  model?: string;
  prompt?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
};

export interface ChatCompleteOutputs {
  output: string;
}

export function chatComplete(inputs: ChatCompleteInputs): Promise<ChatCompleteOutputs> {
  return callNode<ChatCompleteOutputs>("xai.text.ChatComplete", inputs);
}

// Web Search — xai.text.WebSearch
export type WebSearchInputs = {
  model?: string;
  query?: string;
  search_mode?: "auto" | "on" | "off";
  max_results?: number;
};

export interface WebSearchOutputs {
  output: string;
  citations: string[];
}

export function webSearch(inputs: WebSearchInputs): Promise<WebSearchOutputs> {
  return callNode<WebSearchOutputs>("xai.text.WebSearch", inputs);
}
