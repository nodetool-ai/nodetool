// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Email Skill — skills.email.EmailSkill
export interface EmailSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface EmailSkillOutputs {
  text: string;
}

export function emailSkill(inputs: EmailSkillInputs): DslNode<EmailSkillOutputs, "text"> {
  return createNode("skills.email.EmailSkill", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}
