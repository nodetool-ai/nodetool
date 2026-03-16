// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, OutputHandle } from "../core.js";

// HTML Skill — skills.html.HtmlSkill
export interface HtmlSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface HtmlSkillOutputs {
  html: OutputHandle<unknown>;
  text: OutputHandle<string>;
}

export function htmlSkill(inputs: HtmlSkillInputs): DslNode<HtmlSkillOutputs> {
  return createNode("skills.html.HtmlSkill", inputs as Record<string, unknown>, { multiOutput: true });
}
