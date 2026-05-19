// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Claude Agent — anthropic.agents.ClaudeAgent
export interface ClaudeAgentInputs {
  prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  system_prompt?: Connectable<string>;
  max_turns?: Connectable<number>;
  allowed_tools?: Connectable<string[]>;
  permission_mode?: Connectable<"default" | "acceptEdits" | "plan" | "bypassPermissions">;
}

export interface ClaudeAgentOutputs {
  text: string;
  chunk: unknown;
}

export function claudeAgent(inputs: ClaudeAgentInputs): DslNode<ClaudeAgentOutputs> {
  return createNode("anthropic.agents.ClaudeAgent", inputs as Record<string, unknown>, { outputNames: ["text", "chunk"], streaming: true });
}
