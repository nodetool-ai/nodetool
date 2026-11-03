// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Web Search — anthropic.text.WebSearch
export type WebSearchInputs = {
  query?: string;
  model?: unknown;
};

export interface WebSearchOutputs {
  text: string;
  sources: unknown[];
}

export function webSearch(inputs: WebSearchInputs): Promise<WebSearchOutputs> {
  return callNode<WebSearchOutputs>("anthropic.text.WebSearch", inputs);
}
