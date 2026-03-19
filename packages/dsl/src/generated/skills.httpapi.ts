// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// HTTP API Skill — skills.httpapi.HttpApiSkill
export interface HttpApiSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface HttpApiSkillOutputs {
  text: string;
}

export function httpApiSkill(inputs: HttpApiSkillInputs): DslNode<HttpApiSkillOutputs, "text"> {
  return createNode("skills.httpapi.HttpApiSkill", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}
