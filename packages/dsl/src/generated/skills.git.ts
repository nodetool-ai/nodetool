// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Git Skill — skills.git.GitSkill
export interface GitSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface GitSkillOutputs {
  text: string;
}

export function gitSkill(inputs: GitSkillInputs): DslNode<GitSkillOutputs, "text"> {
  return createNode("skills.git.GitSkill", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}
