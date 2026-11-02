// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Chat Complete — mistral.text.ChatComplete
export type ChatCompleteInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  system_prompt?: Connectable<string>;
  temperature?: Connectable<number>;
  max_tokens?: Connectable<number>;
};

export interface ChatCompleteOutputs {
  output: string;
}

export function chatComplete(inputs: ChatCompleteInputs, options?: NodeOptions): NodeWithOutputs<ChatCompleteOutputs, "output"> {
  return createNode("mistral.text.ChatComplete", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}

// Code Complete — mistral.text.CodeComplete
export type CodeCompleteInputs = {
  prompt?: Connectable<string>;
  suffix?: Connectable<string>;
  temperature?: Connectable<number>;
  max_tokens?: Connectable<number>;
};

export interface CodeCompleteOutputs {
  output: string;
}

export function codeComplete(inputs: CodeCompleteInputs, options?: NodeOptions): NodeWithOutputs<CodeCompleteOutputs, "output"> {
  return createNode("mistral.text.CodeComplete", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}
