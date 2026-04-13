// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Chat Complete — mistral.text.ChatComplete
export interface ChatCompleteInputs {
  model?: Connectable<"mistral-large-latest" | "mistral-medium-latest" | "mistral-small-latest" | "pixtral-large-latest" | "codestral-latest" | "ministral-8b-latest" | "ministral-3b-latest">;
  prompt?: Connectable<string>;
  system_prompt?: Connectable<string>;
  temperature?: Connectable<number>;
  max_tokens?: Connectable<number>;
}

export interface ChatCompleteOutputs {
  output: string;
}

export function chatComplete(inputs: ChatCompleteInputs): DslNode<ChatCompleteOutputs, "output"> {
  return createNode("mistral.text.ChatComplete", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Code Complete — mistral.text.CodeComplete
export interface CodeCompleteInputs {
  prompt?: Connectable<string>;
  suffix?: Connectable<string>;
  temperature?: Connectable<number>;
  max_tokens?: Connectable<number>;
}

export interface CodeCompleteOutputs {
  output: string;
}

export function codeComplete(inputs: CodeCompleteInputs): DslNode<CodeCompleteOutputs, "output"> {
  return createNode("mistral.text.CodeComplete", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
