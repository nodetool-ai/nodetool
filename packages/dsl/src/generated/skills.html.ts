// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// HTML Skill — skills.html.HtmlSkill
export interface HtmlSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface HtmlSkillOutputs {
  html: unknown;
  text: string;
}

export function htmlSkill(inputs: HtmlSkillInputs): DslNode<HtmlSkillOutputs> {
  return createNode("skills.html.HtmlSkill", inputs as Record<string, unknown>, { outputNames: ["html", "text"] });
}
