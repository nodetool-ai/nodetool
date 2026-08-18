// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Chat Complete — mistral.text.ChatComplete
export type ChatCompleteInputs = {
  model?: "mistral-large-latest" | "mistral-medium-latest" | "mistral-small-latest" | "pixtral-large-latest" | "codestral-latest" | "ministral-8b-latest" | "ministral-3b-latest";
  prompt?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
};

export interface ChatCompleteOutputs {
  output: string;
}

export function chatComplete(inputs: ChatCompleteInputs): Promise<ChatCompleteOutputs> {
  return callNode<ChatCompleteOutputs>("mistral.text.ChatComplete", inputs);
}

// Code Complete — mistral.text.CodeComplete
export type CodeCompleteInputs = {
  prompt?: string;
  suffix?: string;
  temperature?: number;
  max_tokens?: number;
};

export interface CodeCompleteOutputs {
  output: string;
}

export function codeComplete(inputs: CodeCompleteInputs): Promise<CodeCompleteOutputs> {
  return callNode<CodeCompleteOutputs>("mistral.text.CodeComplete", inputs);
}
