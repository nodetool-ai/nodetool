// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Chat Complete — mistral.text.ChatComplete
export interface ChatCompleteInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  system_prompt?: Connectable<string>;
  temperature?: Connectable<number>;
  max_tokens?: Connectable<number>;
}

export function chatComplete(inputs: ChatCompleteInputs): DslNode<SingleOutput<string>> {
  return createNode("mistral.text.ChatComplete", inputs as Record<string, unknown>);
}

// Code Complete — mistral.text.CodeComplete
export interface CodeCompleteInputs {
  prompt?: Connectable<string>;
  suffix?: Connectable<string>;
  temperature?: Connectable<number>;
  max_tokens?: Connectable<number>;
}

export function codeComplete(inputs: CodeCompleteInputs): DslNode<SingleOutput<string>> {
  return createNode("mistral.text.CodeComplete", inputs as Record<string, unknown>);
}
