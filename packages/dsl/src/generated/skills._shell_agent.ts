// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Shell Agent Skill — skills._shell_agent.ShellAgentSkill
export interface ShellAgentSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface ShellAgentSkillOutputs {
  text: string;
}

export function shellAgentSkill(inputs: ShellAgentSkillInputs): DslNode<ShellAgentSkillOutputs, "text"> {
  return createNode("skills._shell_agent.ShellAgentSkill", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}
